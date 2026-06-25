import Ajv from 'ajv';

import type {
  Agent,
  AgentInstruction,
  AgentRuntimeContext,
  AgentState,
  GeneralAgentCallLLMInstructionPayload,
  GeneralAgentConfig,
  GraphContext,
  GraphPhaseToolPolicy,
  ReasoningGraph,
  Transition,
} from '../types';
import { GeneralChatAgent } from './GeneralChatAgent';
import {
  filterToolsForGraphPhase,
  GRAPH_PHASE_TOOL_POLICY_METADATA_KEY,
  GRAPH_PHASE_TOOLS_METADATA_KEY,
} from './graphToolPolicy';

const GRAPH_CONTEXT_KEY = '__graphContext';
const GRAPH_EXIT_AFTER_ENV = 'TB_GRAPH_EXIT_AFTER';
const MAX_EXTRACTION_ATTEMPTS = 3;
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * GraphAgent — A graph-driven Agent that decorates GeneralChatAgent.
 *
 * Instead of the default phase-driven loop (LLM decides flow),
 * GraphAgent uses a declarative ReasoningGraph to drive execution:
 *
 * 1. Each graph node maps to one or more AgentRuntime steps
 * 2. 'agent' nodes delegate to GeneralChatAgent for full tool-calling loops
 * 3. 'llm' nodes do a single LLM call with structured output
 * 4. Transitions are evaluated programmatically (not by LLM)
 * 5. Backtracking is supported with configurable limits
 *
 * Key mechanism: intercept GeneralChatAgent's 'finish' instruction.
 * When the inner agent finishes, GraphAgent checks if the graph has more
 * nodes to execute. Only when the terminal node completes does GraphAgent
 * return a real 'finish'.
 *
 * Agent vs LLM nodes:
 * - 'agent' nodes: prompt sent WITHOUT JSON schema → agent loop with tools →
 *   on finish, extra LLM call to extract structured output
 * - 'llm' nodes: prompt sent WITH JSON schema → single structured LLM call
 */
export class GraphAgent implements Agent {
  private innerAgent: GeneralChatAgent;
  private graph: ReasoningGraph;

  constructor(config: GeneralAgentConfig & { graph: ReasoningGraph }) {
    const { graph, ...generalConfig } = config;
    this.graph = graph;
    this.innerAgent = new GeneralChatAgent(generalConfig);
  }

  async runner(
    context: AgentRuntimeContext,
    state: AgentState,
  ): Promise<AgentInstruction | AgentInstruction[]> {
    const gc = this.getGraphContext(state);

    // First call — initialize graph and start entry node
    if (!gc) {
      return this.initGraph(context, state);
    }

    const node = this.graph.states[gc.currentNode];
    if (!node) {
      return {
        reason: 'error_recovery',
        reasonDetail: `Graph node "${gc.currentNode}" not found`,
        type: 'finish',
      };
    }

    // Agent node: delegate to GeneralChatAgent for the tool-calling loop
    if (gc.nodeActive && node.type === 'agent') {
      // If we're in the extraction phase, handle the extraction result
      if (gc.extracting) {
        if (context.phase === 'llm_result') {
          gc.extracting = false;
          return this.onNodeComplete(state, gc);
        }
        return this.innerAgent.runner(context, state);
      }

      if (this.hasNodeStepLimitExceeded(state, gc, node.maxAgentSteps)) {
        gc.nodeStepLimitExceeded = true;
        return this.startExtraction(state, gc);
      }

      const instruction = await this.innerAgent.runner(context, state);

      // Intercept finish — agent loop done, now extract structured output
      if (!Array.isArray(instruction) && instruction.type === 'finish') {
        return this.startExtraction(state, gc);
      }

      if (Array.isArray(instruction)) {
        const hasFinish = instruction.some((i) => i.type === 'finish');
        if (hasFinish) {
          return this.startExtraction(state, gc);
        }
      }

      // Otherwise pass through (call_llm, call_tool, etc.)
      return instruction;
    }

    // LLM node: after the LLM result comes back, extract output and advance
    if (gc.nodeActive && node.type === 'llm') {
      if (context.phase === 'llm_result') {
        return this.onNodeComplete(state, gc);
      }
      // Delegate other phases (like compression_result) to inner agent
      return this.innerAgent.runner(context, state);
    }

    // nodeActive is false — we're at a graph transition point, start the next node
    return this.startNode(gc, state);
  }

  /**
   * Initialize the graph: set up context, start entry node
   */
  private initGraph(_context: AgentRuntimeContext, state: AgentState): AgentInstruction {
    const lastUserMessage = [...state.messages].reverse().find((m: any) => m.role === 'user');
    const input =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage?.content ?? '');

    const gc: GraphContext = {
      currentNode: this.graph.entry,
      nodeActive: false,
      extractionAttempts: 0,
      store: {},
      backtrackCount: 0,
      visitCount: {},
      input,
    };

    this.saveGraphContext(state, gc);
    return this.startNode(gc, state);
  }

  /**
   * Start executing a graph node.
   *
   * - agent nodes: send task prompt WITH tools, WITHOUT JSON schema
   *   (let the agent use tools freely, extract structured output later)
   * - llm nodes: send prompt WITH JSON schema, WITHOUT tools
   *   (single structured generation call)
   */
  private startNode(gc: GraphContext, state: AgentState): AgentInstruction {
    const node = this.graph.states[gc.currentNode];
    if (!node) {
      return {
        reason: 'error_recovery',
        reasonDetail: `Graph node "${gc.currentNode}" not found in states`,
        type: 'finish',
      };
    }

    const visits = (gc.visitCount[gc.currentNode] ?? 0) + 1;
    gc.visitCount[gc.currentNode] = visits;
    gc.extractionAttempts = 0;

    if (visits > 1) {
      gc.backtrackCount++;
    }

    const renderedPrompt = this.renderPrompt(node.prompt, gc);

    let fullPrompt: string;
    let tools: any[];

    if (node.type === 'agent') {
      // Agent node: task prompt with tools, no JSON schema constraint
      // The agent will use tools freely; structured output is extracted after the loop
      const toolPolicy: GraphPhaseToolPolicy | undefined = node.allowedToolApiNames
        ? { allowedApiNames: node.allowedToolApiNames }
        : undefined;
      fullPrompt =
        renderedPrompt +
        '\n\nIMPORTANT: Use your available tools to gather concrete evidence before concluding. ' +
        'Do not answer from memory alone. Inspect the relevant environment, files, commands, ' +
        'or external sources that are available to this agent, then base your findings on tool results.';
      tools = filterToolsForGraphPhase(state.tools ?? [], toolPolicy) ?? [];
      // Persist the filtered tool view so the inner chat loop stays within this phase boundary.
      state.metadata = state.metadata ?? {};
      state.metadata[GRAPH_PHASE_TOOLS_METADATA_KEY] = tools;
      if (node.allowedToolApiNames) {
        state.metadata[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY] = {
          allowedApiNames: node.allowedToolApiNames,
          phase: gc.currentNode,
        };
      } else {
        delete state.metadata[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY];
      }
    } else {
      // LLM node: structured output, no tools
      fullPrompt =
        renderedPrompt +
        `\n\nYou MUST respond with a JSON object that conforms to this schema:\n` +
        `\`\`\`json\n${JSON.stringify(node.outputSchema, null, 2)}\n\`\`\`\n` +
        `Only output valid JSON, no other text.`;
      tools = [];
      if (state.metadata) {
        delete state.metadata[GRAPH_PHASE_TOOLS_METADATA_KEY];
        delete state.metadata[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY];
      }
    }

    gc.nodeActive = true;
    gc.extracting = false;
    gc.nodeStartStepCount = state.stepCount;
    gc.nodeStepLimitExceeded = false;
    this.saveGraphContext(state, gc);

    const messages = [...state.messages, { content: fullPrompt, role: 'user' as const }];

    const payload: GeneralAgentCallLLMInstructionPayload = {
      messages,
      model: state.modelRuntimeConfig?.model ?? '',
      provider: state.modelRuntimeConfig?.provider ?? '',
      tools,
    };

    return { payload, stepLabel: gc.currentNode, type: 'call_llm' };
  }

  /**
   * After an agent node's tool loop finishes, do an extra LLM call
   * to extract structured output from the conversation.
   */
  private startExtraction(state: AgentState, gc: GraphContext): AgentInstruction {
    const node = this.graph.states[gc.currentNode];
    const attemptNumber = (gc.extractionAttempts ?? 0) + 1;
    gc.extractionAttempts = attemptNumber;
    if (state.metadata) {
      delete state.metadata[GRAPH_PHASE_TOOLS_METADATA_KEY];
      delete state.metadata[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY];
    }

    const extractionPrompt =
      `Based on the research and information gathered above, ` +
      `format the conclusions you already reached into a JSON object that conforms to this schema:\n` +
      `\`\`\`json\n${JSON.stringify(node.outputSchema, null, 2)}\n\`\`\`\n` +
      `The goal is formatting, not new exploration or a new solution attempt. The schema is only a template, not the answer. Do not output the schema itself, ` +
      `and do not output top-level "type", "properties", or "required" unless the task explicitly asks for a JSON Schema. ` +
      `Fill the schema with concrete values from the conversation.\n` +
      `Populate the full schema from the conversation. All required fields in the schema are mandatory. ` +
      `Do not omit required fields, even on retries.\n` +
      `If your last draft says you are about to write, implement, run, or continue work, ` +
      `convert that into a handoff summary instead: preserve the final delivery contract, flexible approach, unresolved risks, and later-phase work.\n` +
      `You may write a brief natural-language explanation before the final answer. Put the final JSON object in exactly one markdown fenced code block tagged json. ` +
      (attemptNumber > 1
        ? `This is extraction attempt ${attemptNumber} of ${MAX_EXTRACTION_ATTEMPTS}. Try again from scratch and return the most complete schema-valid JSON object you can produce.\n`
        : '') +
      `Do not put any other JSON code block in your response. Example format only, do not copy the example values:\n` +
      `I converted the gathered notes into the requested fields.\n` +
      `\`\`\`json\n{"fieldName":"concrete value from the conversation","items":[{"name":"known item","status":"unknown until working"}]}\n\`\`\`\n` +
      (gc.nodeStepLimitExceeded
        ? `The current graph node reached its action budget. Do not request tools, do not describe another tool call, and do not continue implementation. ` +
          `This extraction step has no tools available. Your only remaining task is to produce the phase handoff document and the fenced JSON object from information already present in the conversation. ` +
          `If the schema provides a way to mark unknown, blocked, or later-phase-only work, use it for unresolved items.\n`
        : '');

    gc.extracting = true;
    this.saveGraphContext(state, gc);

    const messages = [...state.messages, { content: extractionPrompt, role: 'user' as const }];

    const payload: GeneralAgentCallLLMInstructionPayload = {
      messages,
      model: state.modelRuntimeConfig?.model ?? '',
      provider: state.modelRuntimeConfig?.provider ?? '',
      tools: [], // No tools for extraction
    };

    return { payload, stepLabel: `${gc.currentNode}:extract`, type: 'call_llm' };
  }

  /**
   * Called when a node completes. Extract output, eval transitions, advance graph.
   */
  private onNodeComplete(state: AgentState, gc: GraphContext): AgentInstruction {
    const currentNodeId = gc.currentNode;
    const node = this.graph.states[currentNodeId];

    const output = this.extractStructuredOutput(state);
    const isStructured = this.isExtractionAcceptable(node?.outputSchema, output);
    if (!isStructured) {
      if ((gc.extractionAttempts ?? 0) < MAX_EXTRACTION_ATTEMPTS) {
        gc.extracting = true;
        this.saveGraphContext(state, gc);
        return this.startExtraction(state, gc);
      }

      gc.store[currentNodeId] = output;
      gc.nodeActive = false;
      if (state.metadata) {
        delete state.metadata[GRAPH_PHASE_TOOLS_METADATA_KEY];
        delete state.metadata[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY];
      }
      gc.nodeStepLimitExceeded = false;
      this.saveGraphContext(state, gc);
      return {
        reason: 'error_recovery',
        reasonDetail: `Graph "${this.graph.name}" could not extract structured output for node "${currentNodeId}" after ${MAX_EXTRACTION_ATTEMPTS} attempts`,
        type: 'finish',
      };
    }

    gc.store[currentNodeId] = output;
    gc.nodeActive = false;
    if (state.metadata) {
      delete state.metadata[GRAPH_PHASE_TOOLS_METADATA_KEY];
      delete state.metadata[GRAPH_PHASE_TOOL_POLICY_METADATA_KEY];
    }
    gc.nodeStepLimitExceeded = false;

    const earlyExitNode = this.getEarlyExitNode();
    if (earlyExitNode && earlyExitNode === currentNodeId) {
      this.saveGraphContext(state, gc);
      return {
        reason: 'completed',
        reasonDetail: `Graph "${this.graph.name}" exited early after node "${currentNodeId}" via ${GRAPH_EXIT_AFTER_ENV}`,
        type: 'finish',
      };
    }

    // Evaluate transitions
    const transition = this.evaluateTransitions(gc, currentNodeId, output);

    if (!transition) {
      if (currentNodeId === this.graph.terminal) {
        this.saveGraphContext(state, gc);
        if (this.hasBlockedBacktrackTransition(gc, currentNodeId, output)) {
          return {
            reason: 'error_recovery',
            reasonDetail:
              `Graph "${this.graph.name}" reached backtrack limit ` +
              `(${this.graph.maxBacktracks}) at terminal node "${currentNodeId}" while ` +
              `the terminal output still requested a backtrack: ${JSON.stringify(output)}`,
            type: 'finish',
          };
        }

        return {
          reason: 'completed',
          reasonDetail: `Graph "${this.graph.name}" completed at terminal node "${currentNodeId}"`,
          type: 'finish',
        };
      }

      this.saveGraphContext(state, gc);
      return {
        reason: 'error_recovery',
        reasonDetail: `No valid transition from node "${currentNodeId}"`,
        type: 'finish',
      };
    }

    const nextNodeId = transition.to;

    this.applyTransitionEffects(gc, transition, currentNodeId, output);

    // Move to next node
    gc.currentNode = nextNodeId;

    this.saveGraphContext(state, gc);
    return this.startNode(gc, state);
  }

  private evaluateTransitions(
    gc: GraphContext,
    currentNodeId: string,
    output: Record<string, any>,
  ): Transition | null {
    const backtrackLimitReached = gc.backtrackCount >= this.graph.maxBacktracks;

    for (const t of this.graph.transitions) {
      if (t.from !== currentNodeId) continue;
      try {
        const result = new Function('output', `return (${t.condition})`)(output);
        if (result) {
          // If the transition target is a backtrack (already visited), only allow it
          // when within the backtrack limit. Otherwise fall through to linear advance.
          const isBacktrack = (gc.visitCount[t.to] ?? 0) > 0;
          if (isBacktrack && backtrackLimitReached) continue;
          return t;
        }
      } catch {
        // condition eval failed, skip
      }
    }

    const nextState = this.getNextState(currentNodeId);
    return nextState ? { condition: 'true', from: currentNodeId, to: nextState } : null;
  }

  private applyTransitionEffects(
    gc: GraphContext,
    transition: Transition,
    currentNodeId: string,
    output: Record<string, any>,
  ): void {
    if (transition.handoff) {
      gc.handoff = {
        from: currentNodeId,
        output: this.pickHandoffOutput(output, transition.handoff.fields),
        to: transition.to,
      };
    } else {
      delete gc.handoff;
    }

    const nodesToClear =
      transition.clearNodes ?? this.getDefaultBacktrackClearNodes(currentNodeId, transition.to);
    for (const nodeId of nodesToClear) {
      delete gc.store[nodeId];
    }
  }

  private pickHandoffOutput(output: Record<string, any>, fields?: string[]): Record<string, any> {
    if (!fields || fields.length === 0) return output;

    const handoffOutput: Record<string, any> = {};
    for (const field of fields) {
      if (output[field] !== undefined) handoffOutput[field] = output[field];
    }
    return handoffOutput;
  }

  private getDefaultBacktrackClearNodes(currentNodeId: string, nextNodeId: string): string[] {
    const nodeKeys = Object.keys(this.graph.states);
    const fromIdx = nodeKeys.indexOf(currentNodeId);
    const toIdx = nodeKeys.indexOf(nextNodeId);
    if (toIdx < 0 || fromIdx < 0 || toIdx >= fromIdx) return [];

    return nodeKeys.slice(toIdx, fromIdx + 1);
  }

  private hasBlockedBacktrackTransition(
    gc: GraphContext,
    currentNodeId: string,
    output: Record<string, any>,
  ): boolean {
    if (gc.backtrackCount < this.graph.maxBacktracks) return false;

    const currentIdx = Object.keys(this.graph.states).indexOf(currentNodeId);

    return this.graph.transitions.some((t) => {
      if (t.from !== currentNodeId) return false;

      try {
        const result = new Function('output', `return (${t.condition})`)(output);
        if (!result) return false;

        const targetIdx = Object.keys(this.graph.states).indexOf(t.to);
        return targetIdx >= 0 && targetIdx < currentIdx;
      } catch {
        return false;
      }
    });
  }

  private getNextState(currentNodeId: string): string | null {
    const keys = Object.keys(this.graph.states);
    const idx = keys.indexOf(currentNodeId);
    if (currentNodeId === this.graph.terminal) return null;
    return idx >= 0 && idx + 1 < keys.length ? keys[idx + 1] : null;
  }

  private renderPrompt(template: string, gc: GraphContext): string {
    const rawContextNodes: string[] = [];
    const seenRawContextNodes = new Set<string>();

    const rendered = template.replaceAll(/\{\{(\w+)\.(\w+)\}\}/g, (_, stateId, field) => {
      if (stateId === 'handoff') {
        const val = gc.handoff?.[field as keyof GraphContext['handoff']];
        if (val === undefined) return `(handoff has no ${field} yet)`;
        return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
      }

      if (stateId === 'input' && field === 'question') {
        return gc.input;
      }

      const data = gc.store[stateId];
      if (!data) return `(${stateId} has no data yet)`;
      const val = data[field];
      if (val === undefined) {
        const missingFieldTag = `<missing_field node="${stateId}" field="${field}" />`;
        const rawValue = data._raw;

        if (
          typeof rawValue === 'string' &&
          rawValue.length > 0 &&
          !seenRawContextNodes.has(stateId)
        ) {
          seenRawContextNodes.add(stateId);
          rawContextNodes.push(stateId);
        }

        return missingFieldTag;
      }
      return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    });

    if (rawContextNodes.length === 0) return rendered;

    const rawContexts = rawContextNodes
      .map((stateId) => `<raw_fields node="${stateId}">\n${gc.store[stateId]._raw}\n</raw_fields>`)
      .join('\n');

    return `${rendered}\n\n<raw_contexts>\n${rawContexts}\n</raw_contexts>`;
  }

  private extractStructuredOutput(state: AgentState): Record<string, any> {
    const lastAssistantMessage = [...state.messages]
      .reverse()
      .find((m: any) => m.role === 'assistant');

    if (!lastAssistantMessage) return {};

    const content =
      typeof lastAssistantMessage.content === 'string' ? lastAssistantMessage.content : '';

    // Extract JSON from markdown code blocks or raw content
    const fenceStart = content.indexOf('```');
    let jsonStr: string;
    if (fenceStart !== -1) {
      const contentAfterFence = content.slice(fenceStart + 3);
      // Skip optional language tag (e.g. "json\n")
      const newlineIdx = contentAfterFence.indexOf('\n');
      const bodyStart = newlineIdx !== -1 ? newlineIdx + 1 : 0;
      const fenceEnd = contentAfterFence.indexOf('```', bodyStart);
      jsonStr = (
        fenceEnd !== -1
          ? contentAfterFence.slice(bodyStart, fenceEnd)
          : contentAfterFence.slice(bodyStart)
      ).trim();
    } else {
      jsonStr = content.trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (this.isSchemaEcho(parsed)) return { _raw: content };
      return parsed;
    } catch {
      return { _raw: content };
    }
  }

  private isSchemaEcho(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const output = value as Record<string, unknown>;
    if (!('type' in output) || !('properties' in output)) return false;

    const hasConcreteFields = Object.keys(output).some(
      (key) =>
        key !== 'type' &&
        key !== 'properties' &&
        key !== 'required' &&
        key !== 'additionalProperties',
    );

    return !hasConcreteFields;
  }

  private isExtractionAcceptable(
    schema: Record<string, any> | undefined,
    value: Record<string, any>,
  ): boolean {
    if (!schema) return false;

    const decisionSchema = schema.properties?.decision;
    if (decisionSchema) {
      if (typeof value.decision !== 'string') return false;
      const allowedDecisions = Array.isArray(decisionSchema.enum) ? decisionSchema.enum : null;
      return !allowedDecisions || allowedDecisions.includes(value.decision);
    }

    return this.isSchemaEcho(value) ? false : this.isStructuredJson(schema, value);
  }

  private isStructuredJson(schema: Record<string, any>, value: Record<string, any>): boolean {
    try {
      return ajv.validate(schema, value) === true;
    } catch {
      return false;
    }
  }

  private getGraphContext(state: AgentState): GraphContext | null {
    return (state.metadata?.[GRAPH_CONTEXT_KEY] as GraphContext) ?? null;
  }

  private getEarlyExitNode(): string | undefined {
    const configuredNode = process.env[GRAPH_EXIT_AFTER_ENV];
    if (!configuredNode) return undefined;
    return this.graph.states[configuredNode] ? configuredNode : undefined;
  }

  private hasNodeStepLimitExceeded(
    state: AgentState,
    gc: GraphContext,
    maxAgentSteps?: number,
  ): boolean {
    if (!maxAgentSteps || maxAgentSteps <= 0) return false;

    const nodeStartStepCount = gc.nodeStartStepCount ?? state.stepCount;
    return state.stepCount - nodeStartStepCount >= maxAgentSteps;
  }

  private saveGraphContext(state: AgentState, gc: GraphContext): void {
    if (!state.metadata) state.metadata = {};
    state.metadata[GRAPH_CONTEXT_KEY] = gc;
  }
}
