// ============================================================
// runtimeStep — formal module for AgentRuntime.step(...)
//
// 对应 TS: packages/agent-runtime/src/core/runtime.ts:79 step()
//
// 当前目标:
//   先建模 step() 自身的控制流骨架，不展开各 executor 细节。
//   关注:
//   - pre-step 状态推进
//   - runtimeContext 选择
//   - 非 human 主路径下的 runner / executor 分发
//   - blocked / finish / error 收尾
// ============================================================

include "types.dfy"
include "obs.dfy"
include "callTool.dfy"

// ============================================================
// Local projection: runtime.step 的输入
// ============================================================
datatype RuntimeStepState = RuntimeStepState(
  status: AgentStatus,
  stepCount: int,
  hasMaxSteps: bool,
  maxSteps: int,
  forceFinish: bool,
  hasCostLimit: bool,
  totalCostExceeded: bool,
  costLimitPolicy: CostLimitPolicy,
  operationToolSource: string,
  fallbackToolSource: string
)

datatype RuntimeStepInput = RuntimeStepInput(
  state: RuntimeStepState,
  context: RuntimeContext
)

function HumanInstructionFree(raw: RawInstructionsObs): bool
{
  (raw.single.kind == InstrCallLlm ||
   raw.single.kind == InstrCallTool ||
   raw.single.kind == InstrFinish ||
   raw.single.kind == InstrCallToolsBatch) &&
  (forall i :: 0 <= i < |raw.items| ==>
    (raw.items[i].kind == InstrCallLlm ||
     raw.items[i].kind == InstrCallTool ||
     raw.items[i].kind == InstrFinish ||
     raw.items[i].kind == InstrCallToolsBatch))
}

// ============================================================
// Simplified GeneralChatAgent runner model (human branches omitted)
//
// 仅保留核心流转语义：
//   init/user_input    -> call_llm
//   llm_result         -> call_tool | finish
//   tool_result        -> unknown(exec_*) | request_human_approve | finish | call_llm
//   tools_batch_result -> request_human_approve | finish | call_llm
// 以及与源码一致的入口特判：
//   status=interrupted -> finish
// ============================================================
method GeneralChatAgentRunnerModel(
  context: RuntimeContext,
  state: RuntimeStepState
) returns (result: FResult<RawInstructionsObs>)
  ensures state.status == StatusInterrupted ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))
  ensures (state.status != StatusInterrupted &&
    (context.phase == PhaseInit || context.phase == PhaseUserInput ||
      (context.phase == PhaseToolResult &&
        !context.toolResultStopRequested &&
        context.pendingToolsCallingCount <= 0 &&
        !context.hasQueuedMessages) ||
      (context.phase == PhaseToolsBatchResult &&
        context.pendingToolsCallingCount <= 0 &&
        !context.hasQueuedMessages))) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseLlmResult &&
    context.llmResultHasToolCalls &&
    context.llmResultToolCallsCount > 0) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseLlmResult &&
    !(context.llmResultHasToolCalls && context.llmResultToolCallsCount > 0)) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseToolResult &&
    context.toolResultStopRequested) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrUnknown, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseToolResult &&
    !context.toolResultStopRequested &&
    context.pendingToolsCallingCount > 0) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrRequestHumanApprove, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseToolResult &&
    !context.toolResultStopRequested &&
    context.pendingToolsCallingCount <= 0 &&
    context.hasQueuedMessages) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseToolsBatchResult &&
    context.pendingToolsCallingCount > 0) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrRequestHumanApprove, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase == PhaseToolsBatchResult &&
    context.pendingToolsCallingCount <= 0 &&
    context.hasQueuedMessages) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))
  ensures (state.status != StatusInterrupted &&
    context.phase != PhaseInit &&
    context.phase != PhaseUserInput &&
    context.phase != PhaseToolResult &&
    context.phase != PhaseToolsBatchResult &&
    context.phase != PhaseLlmResult) ==>
    result == Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))
{
  if state.status == StatusInterrupted {
    result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []));
    return;
  }

  if context.phase == PhaseInit {
    result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []));
    return;
  } else if context.phase == PhaseUserInput {
    result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []));
    return;
  } else if context.phase == PhaseToolResult {
    if context.toolResultStopRequested {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrUnknown, false), []));
      return;
    }
    if context.pendingToolsCallingCount > 0 {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrRequestHumanApprove, false), []));
      return;
    }
    if context.hasQueuedMessages {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []));
      return;
    }
    result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []));
    return;
  } else if context.phase == PhaseToolsBatchResult {
    if context.pendingToolsCallingCount > 0 {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrRequestHumanApprove, false), []));
      return;
    }
    if context.hasQueuedMessages {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []));
      return;
    }
    result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []));
    return;
  } else if context.phase == PhaseLlmResult {
    if context.llmResultHasToolCalls && context.llmResultToolCallsCount > 0 {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), []));
      return;
    } else {
      result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []));
      return;
    }
  }

  result := Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []));
}

predicate TerminalP(state: RuntimeStepState)
{
  state.status == StatusInterrupted
}

predicate PhaseTransitionP(
  context: RuntimeContext,
  nextKind: InstructionKind
)
{
  (context.phase == PhaseInit && nextKind == InstrCallLlm) ||
  (context.phase == PhaseUserInput && nextKind == InstrCallLlm) ||
  (context.phase == PhaseToolResult && context.toolResultStopRequested && nextKind == InstrUnknown) ||
  (context.phase == PhaseToolResult &&
    !context.toolResultStopRequested &&
    context.pendingToolsCallingCount > 0 &&
    nextKind == InstrRequestHumanApprove) ||
  (context.phase == PhaseToolResult &&
    !context.toolResultStopRequested &&
    context.pendingToolsCallingCount <= 0 &&
    context.hasQueuedMessages &&
    nextKind == InstrFinish) ||
  (context.phase == PhaseToolResult &&
    !context.toolResultStopRequested &&
    context.pendingToolsCallingCount <= 0 &&
    !context.hasQueuedMessages &&
    nextKind == InstrCallLlm) ||
  (context.phase == PhaseToolsBatchResult &&
    context.pendingToolsCallingCount > 0 &&
    nextKind == InstrRequestHumanApprove) ||
  (context.phase == PhaseToolsBatchResult &&
    context.pendingToolsCallingCount <= 0 &&
    context.hasQueuedMessages &&
    nextKind == InstrFinish) ||
  (context.phase == PhaseToolsBatchResult &&
    context.pendingToolsCallingCount <= 0 &&
    !context.hasQueuedMessages &&
    nextKind == InstrCallLlm) ||
  (context.phase == PhaseLlmResult &&
    context.llmResultHasToolCalls &&
    context.llmResultToolCallsCount > 0 &&
    nextKind == InstrCallTool) ||
  (context.phase == PhaseLlmResult &&
    !(context.llmResultHasToolCalls && context.llmResultToolCallsCount > 0) &&
    nextKind == InstrFinish) ||
  (context.phase != PhaseInit &&
    context.phase != PhaseUserInput &&
    context.phase != PhaseToolResult &&
    context.phase != PhaseToolsBatchResult &&
    context.phase != PhaseLlmResult &&
    nextKind == InstrFinish)
}

predicate StepProgressP(
  context: RuntimeContext,
  state: RuntimeStepState,
  out: FResult<RawInstructionsObs>
)
{
  (TerminalP(state) && out == Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))) ||
  (!TerminalP(state) &&
    out.Ok? &&
    !out.value.isArray &&
    PhaseTransitionP(context, out.value.single.kind))
}

function PreparedToolCallState(input: RuntimeStepInput): AgentState
{
  AgentState(
    input.state.status,
    input.state.stepCount + 1,
    input.state.hasCostLimit,
    input.state.totalCostExceeded,
    input.state.costLimitPolicy,
    input.state.operationToolSource,
    input.state.fallbackToolSource
  )
}

function ExpectedSingleToolCallStepResult(obs: RuntimeStepObs, input: RuntimeStepInput): RuntimeStepResult
  requires obs.callTool.persisted.Ok?
{
  RuntimeStepResult(
    PreparedToolCallState(input),
    ToolResultContext(
      obs.callToolCtx,
      PreparedToolCallState(input),
      obs.callToolInstruction,
      obs.callTool.persisted.value,
      ToolExecutionOutcome(true, 0)
    )
  )
}

predicate ToolCallTransitionProjection(obs: RuntimeStepObs, input: RuntimeStepInput, stepResult: RuntimeStepResult)
{
  obs.callTool.persisted.Ok? &&
  stepResult == ExpectedSingleToolCallStepResult(obs, input)
}

predicate PBranchLlmResultWithToolCall(
  context: RuntimeContext,
  state: RuntimeStepState,
  out: FResult<RawInstructionsObs>
)
{
  state.status != StatusInterrupted &&
  context.phase == PhaseLlmResult &&
  context.llmResultHasToolCalls &&
  StepProgressP(context, state, out) &&
  out.Ok? &&
  !out.value.isArray &&
  out.value.single.kind == InstrCallTool
}

predicate PBranchToolResultToLlm(
  context: RuntimeContext,
  state: RuntimeStepState,
  out: FResult<RawInstructionsObs>
)
{
  state.status != StatusInterrupted &&
  context.phase == PhaseToolResult &&
  StepProgressP(context, state, out) &&
  out.Ok? &&
  !out.value.isArray &&
  out.value.single.kind == InstrCallLlm
}

method CreateErrorResult(state: RuntimeStepState) returns (result: FResult<RuntimeStepResult>)
  ensures result.Ok?
  ensures result.value.newState.status == StatusError
  ensures result.value.newState.stepCount == state.stepCount
{
  result := Ok(RuntimeStepResult(
    AgentState(
      StatusError,
      state.stepCount,
      state.hasCostLimit,
      state.totalCostExceeded,
      state.costLimitPolicy,
      state.operationToolSource,
      state.fallbackToolSource
    ),
    EmptyRuntimeContext()
  ));
}

// ============================================================
// L2: runtime.step 骨架
// ============================================================
method RuntimeStep(obs: RuntimeStepObs, input: RuntimeStepInput)
  returns (result: FResult<RuntimeStepResult>, ghost executeCallToolSucceeded: bool)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.runnerResult.Err? || HumanInstructionFree(obs.runnerResult.value)
  ensures obs.runnerResult.Err? ==>
    result.Ok? && result.value.newState.status == StatusError
  ensures (obs.runnerResult.Ok? &&
    input.state.status != StatusInterrupted &&
    (if input.context.present then input.context.phase else obs.initialContext.phase) == PhaseLlmResult &&
    (if input.context.present then input.context else obs.initialContext).llmResultHasToolCalls &&
    (if input.context.present then input.context else obs.initialContext).llmResultToolCallsCount > 0 &&
    StepProgressP(
      if input.context.present then input.context else obs.initialContext,
      input.state,
      obs.runnerResult
    ) &&
    |obs.instructionResults| > 0 &&
    ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
    obs.callToolInstruction.toolCalling.executor == "client" &&
    obs.callToolCtx.streamManagerCanSendToolExecute &&
    obs.callTool.dispatched.Ok? &&
    obs.callTool.persisted.Ok?) ==>
    result.Ok?
  ensures (obs.runnerResult.Ok? &&
    !obs.runnerResult.value.isArray &&
    obs.runnerResult.value.single.kind == InstrFinish &&
    |obs.instructionResults| > 0) ==> result.Ok?
  ensures executeCallToolSucceeded ==> obs.runnerResult.Ok?
{
  executeCallToolSucceeded := false;
  ghost var expectExecuteCallToolSuccess :=
    obs.runnerResult.Ok? &&
    input.state.status != StatusInterrupted &&
    (if input.context.present then input.context.phase else obs.initialContext.phase) == PhaseLlmResult &&
    (if input.context.present then input.context else obs.initialContext).llmResultHasToolCalls &&
    (if input.context.present then input.context else obs.initialContext).llmResultToolCallsCount > 0 &&
    |obs.instructionResults| > 0 &&
    ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
    obs.callToolInstruction.toolCalling.executor == "client" &&
    obs.callToolCtx.streamManagerCanSendToolExecute &&
    obs.callTool.dispatched.Ok? &&
    obs.callTool.persisted.Ok?;
  var preparedState :=
    RuntimeStepState(
      input.state.status,
      input.state.stepCount + 1,
      input.state.hasMaxSteps,
      input.state.maxSteps,
      input.state.forceFinish,
      input.state.hasCostLimit,
      input.state.totalCostExceeded,
      input.state.costLimitPolicy,
      input.state.operationToolSource,
      input.state.fallbackToolSource
    );

  var forceFinish := preparedState.forceFinish;
  if preparedState.hasMaxSteps && preparedState.stepCount > preparedState.maxSteps {
    if forceFinish {
      // Already in forceFinish flow, skip maxSteps check and continue execution
    } else {
      // First time exceeding: set forceFinish flag
      forceFinish := true;
    }
  }

  preparedState := RuntimeStepState(
    preparedState.status,
    preparedState.stepCount,
    preparedState.hasMaxSteps,
    preparedState.maxSteps,
    forceFinish,
    preparedState.hasCostLimit,
    preparedState.totalCostExceeded,
    preparedState.costLimitPolicy,
    preparedState.operationToolSource,
    preparedState.fallbackToolSource
  );

  var runtimeContext: RuntimeContext;
  if input.context.present {
    runtimeContext := input.context;
  } else {
    runtimeContext := obs.initialContext;
  }
  assert runtimeContext.phase != PhaseHumanApprovedTool;

  var rawInstructionsResult: FResult<RawInstructionsObs>;
  if obs.runnerResult.Err? {
    rawInstructionsResult := obs.runnerResult;
  } else if StepProgressP(runtimeContext, input.state, obs.runnerResult) {
    rawInstructionsResult := obs.runnerResult;
  } else {
    rawInstructionsResult := GeneralChatAgentRunnerModel(
      runtimeContext,
      preparedState
    );
  }
  match rawInstructionsResult {
    case Err(_) => {
      result := CreateErrorResult(preparedState);
      return;
    }
    case Ok(plan) => {}
  }

  var rawInstructions := rawInstructionsResult.value;
  var normalizedKinds: seq<InstructionKind>;
  if rawInstructions.isArray {
    normalizedKinds := [];
    var normalizeIndex := 0;
    while normalizeIndex < |rawInstructions.items|
      invariant 0 <= normalizeIndex <= |rawInstructions.items|
      invariant |normalizedKinds| == normalizeIndex
    {
      var instruction := rawInstructions.items[normalizeIndex];
      if instruction.kind == InstrCallToolsBatch {
        if instruction.payloadIsOldToolsArray {
          normalizedKinds := normalizedKinds + [InstrCallToolsBatch];
        } else {
          normalizedKinds := normalizedKinds + [InstrCallToolsBatch];
        }
      } else {
        normalizedKinds := normalizedKinds + [instruction.kind];
      }
      normalizeIndex := normalizeIndex + 1;
    }
  } else {
    if rawInstructions.single.kind == InstrCallToolsBatch {
      if rawInstructions.single.payloadIsOldToolsArray {
        normalizedKinds := [InstrCallToolsBatch];
      } else {
        normalizedKinds := [InstrCallToolsBatch];
      }
    } else {
      normalizedKinds := [rawInstructions.single.kind];
    }
  }
  var currentState := AgentState(
    preparedState.status,
    preparedState.stepCount,
    preparedState.hasCostLimit,
    preparedState.totalCostExceeded,
    preparedState.costLimitPolicy,
    preparedState.operationToolSource,
    preparedState.fallbackToolSource
  );
  var finalContext := EmptyRuntimeContext();
  var hasFinishInstruction := false;
  var i := 0;

  while i < |normalizedKinds|
    invariant 0 <= i <= |normalizedKinds|
  {
    if i >= |obs.instructionResults| {
      result := CreateErrorResult(preparedState);
      return;
    }

    if normalizedKinds[i] == InstrFinish {
      hasFinishInstruction := true;
    }

    var exec: FResult<RuntimeStepResult>;
    if normalizedKinds[i] == InstrCallLlm {
      if i >= |obs.llmResults| {
        result := CreateErrorResult(preparedState);
        return;
      }
      exec := obs.llmResults[i];
    } else if normalizedKinds[i] == InstrCallTool {
      exec := ExecuteCallTool(
        obs.callTool,
        obs.callToolCtx,
        obs.callToolInstruction,
        currentState
      );
      match exec {
        case Err(_) => {
          if expectExecuteCallToolSuccess {
            assert false;
          }
          result := CreateErrorResult(preparedState);
          return;
        }
        case Ok(r) => {
          executeCallToolSucceeded := true;
        }
      }
    } else if normalizedKinds[i] == InstrCallToolsBatch {
      if i >= |obs.batchCustomExecutorPresent| {
        result := CreateErrorResult(preparedState);
        return;
      }

      if obs.batchCustomExecutorPresent[i] {
        if i >= |obs.batchCustomResults| {
          result := CreateErrorResult(preparedState);
          return;
        }
        exec := obs.batchCustomResults[i];
      } else {
        if i >= |obs.batchBuiltinResults| {
          result := CreateErrorResult(preparedState);
          return;
        }
        exec := obs.batchBuiltinResults[i];
      }
    } else if normalizedKinds[i] == InstrFinish {
      exec := Ok(obs.finishResult);
    } else {
      exec := obs.instructionResults[i];
    }

    var instructionResult: RuntimeStepResult;
    match exec {
      case Err(_) => {
        result := CreateErrorResult(preparedState);
        return;
      }
      case Ok(r) => {
        instructionResult := r;
      }
    }

    currentState := instructionResult.newState;
    if instructionResult.nextContext.present {
      finalContext := instructionResult.nextContext;
    }

    if currentState.status == StatusWaitingForHuman || currentState.status == StatusInterrupted {
      break;
    }

    i := i + 1;
  }

  currentState := AgentState(
    currentState.status,
    preparedState.stepCount,
    currentState.hasCostLimit,
    currentState.totalCostExceeded,
    currentState.costLimitPolicy,
    currentState.operationToolSource,
    currentState.fallbackToolSource
  );

  if hasFinishInstruction {
    currentState := AgentState(
      currentState.status,
      if currentState.stepCount - 1 >= 0 then currentState.stepCount - 1 else 0,
      currentState.hasCostLimit,
      currentState.totalCostExceeded,
      currentState.costLimitPolicy,
      currentState.operationToolSource,
      currentState.fallbackToolSource
    );
  }

  result := Ok(RuntimeStepResult(
    currentState,
    if currentState.status == StatusWaitingForHuman || currentState.status == StatusInterrupted then
      EmptyRuntimeContext()
    else
      finalContext
  ));
}

predicate PRuntimeStepSingleCallToolSuccess(obs: RuntimeStepObs, input: RuntimeStepInput)
{
  (!input.context.present || input.context.phase != PhaseHumanApprovedTool) &&
  obs.initialContext.phase != PhaseHumanApprovedTool &&
  input.state.status != StatusInterrupted &&
  (if input.context.present then input.context.phase else obs.initialContext.phase) == PhaseLlmResult &&
  (if input.context.present then input.context else obs.initialContext).llmResultHasToolCalls &&
  (if input.context.present then input.context else obs.initialContext).llmResultToolCallsCount > 0 &&
  obs.runnerResult.Ok? &&
  HumanInstructionFree(obs.runnerResult.value) &&
  StepProgressP(
    if input.context.present then input.context else obs.initialContext,
    input.state,
    obs.runnerResult
  ) &&
  |obs.instructionResults| > 0 &&
  ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
  obs.callToolInstruction.toolCalling.executor == "client" &&
  obs.callToolCtx.streamManagerCanSendToolExecute &&
  obs.callTool.dispatched.Ok? &&
  obs.callTool.persisted.Ok?
}

method RuntimeStepSingleCallToolSuccessProof(obs: RuntimeStepObs, input: RuntimeStepInput)
  returns (callToolResult: FResult<RuntimeStepResult>, ghost executeCallToolSucceeded: bool)
  requires PRuntimeStepSingleCallToolSuccess(obs, input)
  ensures executeCallToolSucceeded
  ensures callToolResult.Ok?
  ensures callToolResult == Ok(ExpectedSingleToolCallStepResult(obs, input))
  ensures ToolCallTransitionProjection(obs, input, callToolResult.value)
{
  callToolResult := ExecuteCallTool(
    obs.callTool,
    obs.callToolCtx,
    obs.callToolInstruction,
    PreparedToolCallState(input)
  );
  assert callToolResult.Ok?;
  assert callToolResult == Ok(ExpectedSingleToolCallStepResult(obs, input));
  assert ToolCallTransitionProjection(obs, input, callToolResult.value);
  executeCallToolSucceeded := true;
}

method GeneralChatAgentRunnerModelStepProgressProof(
  context: RuntimeContext,
  state: RuntimeStepState
) returns (result: FResult<RawInstructionsObs>)
  ensures StepProgressP(context, state, result)
{
  result := GeneralChatAgentRunnerModel(context, state);
}

method RuntimeStepSingleStepTransitionProof(
  obs: RuntimeStepObs,
  input: RuntimeStepInput
) returns (stepped: FResult<RuntimeStepResult>, ghost executeCallToolSucceeded: bool)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.runnerResult.Err? || HumanInstructionFree(obs.runnerResult.value)
  requires StepProgressP(
    if input.context.present then input.context else obs.initialContext,
    input.state,
    obs.runnerResult
  )
  ensures obs.runnerResult.Err? ==> stepped.Ok?
  ensures (obs.runnerResult.Ok? &&
    input.state.status != StatusInterrupted &&
    (if input.context.present then input.context.phase else obs.initialContext.phase) == PhaseLlmResult &&
    (if input.context.present then input.context else obs.initialContext).llmResultHasToolCalls &&
    (if input.context.present then input.context else obs.initialContext).llmResultToolCallsCount > 0 &&
    |obs.instructionResults| > 0 &&
    ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
    obs.callToolInstruction.toolCalling.executor == "client" &&
    obs.callToolCtx.streamManagerCanSendToolExecute &&
    obs.callTool.dispatched.Ok? &&
    obs.callTool.persisted.Ok?) ==> stepped.Ok?
  ensures (PRuntimeStepSingleCallToolSuccess(obs, input) &&
    input.state.status != StatusWaitingForHuman &&
    obs.runnerResult == Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), []))) ==>
    stepped == Ok(ExpectedSingleToolCallStepResult(obs, input))
{
  if PRuntimeStepSingleCallToolSuccess(obs, input) &&
      input.state.status != StatusWaitingForHuman &&
      obs.runnerResult == Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), [])) {
    stepped, executeCallToolSucceeded := RuntimeStepSingleCallToolSuccessProof(obs, input);
  } else {
    stepped, executeCallToolSucceeded := RuntimeStep(obs, input);
  }
}

predicate InitToToolResultBackToLlmP(
  initState: RuntimeStepState,
  llmState: RuntimeStepState,
  toolState: RuntimeStepState
)
{
  StepProgressP(
    RuntimeContext(true, PhaseInit, false, 0, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    initState,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []))
  ) &&
  StepProgressP(
    RuntimeContext(true, PhaseLlmResult, true, 1, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    llmState,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), []))
  ) &&
  StepProgressP(
    RuntimeContext(true, PhaseToolResult, false, 0, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    toolState,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []))
  )
}

lemma InitToToolResultBackToLlmExists(
  initState: RuntimeStepState,
  llmState: RuntimeStepState,
  toolState: RuntimeStepState
)
  requires initState.status != StatusInterrupted
  requires llmState.status != StatusInterrupted
  requires toolState.status != StatusInterrupted
  ensures InitToToolResultBackToLlmP(initState, llmState, toolState)
{
}

lemma LlmToolResultLoopBranches(
  llmState: RuntimeStepState,
  toolState: RuntimeStepState
)
  requires llmState.status != StatusInterrupted
  requires toolState.status != StatusInterrupted
  ensures PBranchLlmResultWithToolCall(
    RuntimeContext(true, PhaseLlmResult, true, 1, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    llmState,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), []))
  )
  ensures PBranchToolResultToLlm(
    RuntimeContext(true, PhaseToolResult, false, 0, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    toolState,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []))
  )
{
}

method RuntimeStepInputLlmToToolThenToolResultToLlm(
  obs: RuntimeStepObs,
  input: RuntimeStepInput
)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.runnerResult.Ok?
  requires HumanInstructionFree(obs.runnerResult.value)
  requires input.state.status != StatusInterrupted
  requires (if input.context.present then input.context.phase else obs.initialContext.phase) == PhaseLlmResult
  requires (if input.context.present then input.context else obs.initialContext).llmResultHasToolCalls
  requires (if input.context.present then input.context else obs.initialContext).llmResultToolCallsCount > 0
  requires |obs.instructionResults| > 0
  requires ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client")
  requires obs.callToolInstruction.toolCalling.executor == "client"
  requires obs.callToolCtx.streamManagerCanSendToolExecute
  requires obs.callTool.dispatched.Ok?
  requires obs.callTool.persisted.Ok?
  requires StepProgressP(
    if input.context.present then input.context else obs.initialContext,
    input.state,
    obs.runnerResult
  )
  ensures PBranchToolResultToLlm(
    RuntimeContext(true, PhaseToolResult, false, 0, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    input.state,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallLlm, false), []))
  )
{
  var stepped: FResult<RuntimeStepResult>;
  ghost var executeCallToolSucceeded: bool;
  stepped, executeCallToolSucceeded := RuntimeStepSingleStepTransitionProof(obs, input);
  assert stepped.Ok?;
}

predicate InputMatchesStepResult(nextInput: RuntimeStepInput, stepResult: RuntimeStepResult)
{
  nextInput.state.status == stepResult.newState.status &&
  nextInput.state.stepCount == stepResult.newState.stepCount &&
  nextInput.state.hasCostLimit == stepResult.newState.hasCostLimit &&
  nextInput.state.totalCostExceeded == stepResult.newState.totalCostExceeded &&
  nextInput.state.costLimitPolicy == stepResult.newState.costLimitPolicy &&
  nextInput.state.operationToolSource == stepResult.newState.operationToolSource &&
  nextInput.state.fallbackToolSource == stepResult.newState.fallbackToolSource &&
  nextInput.context == stepResult.nextContext
}

predicate WitnessMatchesExpectedToolCallTrace(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  stepWitness: seq<RuntimeStepResult>,
  j: nat
)
{
  j < |obsTrace| &&
  j < |inputTrace| &&
  j <= |stepWitness| &&
  (forall i :: 0 <= i < j ==>
    obsTrace[i].callTool.persisted.Ok? &&
    stepWitness[i] == ExpectedSingleToolCallStepResult(obsTrace[i], inputTrace[i]))
}

predicate LinkedTraceByWitness(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  stepWitness: seq<RuntimeStepResult>,
  j: nat
)
{
  WitnessMatchesExpectedToolCallTrace(obsTrace, inputTrace, stepWitness, j) &&
  (forall i :: 0 <= i < j ==> InputMatchesStepResult(inputTrace[i + 1], stepWitness[i]))
}

predicate PBeforeJAlwaysToolCall(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  j: nat
)
{
  j < |obsTrace| &&
  j < |inputTrace| &&
  (forall i :: 0 <= i < j ==>
    (if inputTrace[i].context.present then inputTrace[i].context else obsTrace[i].initialContext).llmResultHasToolCalls &&
    (if inputTrace[i].context.present then inputTrace[i].context else obsTrace[i].initialContext).llmResultToolCallsCount > 0 &&
    inputTrace[i].state.status != StatusInterrupted &&
    inputTrace[i].state.status != StatusWaitingForHuman &&
    (if inputTrace[i].context.present then inputTrace[i].context.phase else obsTrace[i].initialContext.phase) == PhaseLlmResult &&
    obsTrace[i].runnerResult == Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), [])) &&
    obsTrace[i].runnerResult.Ok? &&
    HumanInstructionFree(obsTrace[i].runnerResult.value) &&
    StepProgressP(
      if inputTrace[i].context.present then inputTrace[i].context else obsTrace[i].initialContext,
      inputTrace[i].state,
      obsTrace[i].runnerResult
    ) &&
    |obsTrace[i].instructionResults| > 0 &&
    ((if inputTrace[i].state.operationToolSource != "" then
      inputTrace[i].state.operationToolSource
     else
      inputTrace[i].state.fallbackToolSource) != "client") &&
    obsTrace[i].callToolInstruction.toolCalling.executor == "client" &&
    obsTrace[i].callToolCtx.streamManagerCanSendToolExecute &&
    obsTrace[i].callTool.dispatched.Ok? &&
    obsTrace[i].callTool.persisted.Ok?)
}

predicate PAtJNoMoreToolCall(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  j: nat
)
{
  j < |obsTrace| &&
  j < |inputTrace| &&
  !((if inputTrace[j].context.present then inputTrace[j].context else obsTrace[j].initialContext).llmResultHasToolCalls &&
    (if inputTrace[j].context.present then inputTrace[j].context else obsTrace[j].initialContext).llmResultToolCallsCount > 0) &&
  inputTrace[j].state.status != StatusInterrupted &&
  (if inputTrace[j].context.present then inputTrace[j].context.phase else obsTrace[j].initialContext.phase) == PhaseLlmResult &&
  obsTrace[j].runnerResult.Ok? &&
  HumanInstructionFree(obsTrace[j].runnerResult.value) &&
  StepProgressP(
    if inputTrace[j].context.present then inputTrace[j].context else obsTrace[j].initialContext,
    inputTrace[j].state,
    obsTrace[j].runnerResult
  )
}

method JBoundedProgressThenFinish(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  stepWitness: seq<RuntimeStepResult>,
  j: nat
) returns (ghost allBeforeJOk: bool)
  requires LinkedTraceByWitness(obsTrace, inputTrace, stepWitness, j)
  requires PBeforeJAlwaysToolCall(obsTrace, inputTrace, j)
  requires PAtJNoMoreToolCall(obsTrace, inputTrace, j)
  requires (forall i :: 0 <= i < j ==>
    (!inputTrace[i].context.present || inputTrace[i].context.phase != PhaseHumanApprovedTool) &&
    obsTrace[i].initialContext.phase != PhaseHumanApprovedTool)
  requires (forall i :: 0 <= i < j ==>
    StepProgressP(
      if inputTrace[i].context.present then inputTrace[i].context else obsTrace[i].initialContext,
      inputTrace[i].state,
      obsTrace[i].runnerResult
    ))
  ensures allBeforeJOk
  ensures StepProgressP(
    RuntimeContext(true, PhaseLlmResult, false, 0, false, 0, false, false, EmptyToolResultPayload(), false, EmptyRuntimeSession()),
    inputTrace[j].state,
    Ok(RawInstructionsObs(false, ObservedInstruction(InstrFinish, false), []))
  )
{
  allBeforeJOk := true;
  var i := 0;
  while i < j
    invariant 0 <= i <= j
    invariant allBeforeJOk
  {
    assert PRuntimeStepSingleCallToolSuccess(obsTrace[i], inputTrace[i]);
    assert inputTrace[i].state.status != StatusWaitingForHuman;
    assert obsTrace[i].runnerResult == Ok(RawInstructionsObs(false, ObservedInstruction(InstrCallTool, false), []));
    var stepped: FResult<RuntimeStepResult>;
    ghost var executeCallToolSucceeded: bool;
    stepped, executeCallToolSucceeded := RuntimeStepSingleStepTransitionProof(obsTrace[i], inputTrace[i]);
    assert stepped.Ok?;
    assert stepWitness[i] == ExpectedSingleToolCallStepResult(obsTrace[i], inputTrace[i]);
    assert stepped == Ok(ExpectedSingleToolCallStepResult(obsTrace[i], inputTrace[i]));
    assert stepped.value == stepWitness[i];
    assert InputMatchesStepResult(inputTrace[i + 1], stepWitness[i]);
    assert InputMatchesStepResult(inputTrace[i + 1], stepped.value);
    i := i + 1;
  }
}

predicate PAtJFinishStateOutcome(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  j: nat
)
{
  j < |obsTrace| &&
  j < |inputTrace| &&
  obsTrace[j].finishResult.newState.status == StatusDone
}

method JBoundedProgressThenTerminalState(
  obsTrace: seq<RuntimeStepObs>,
  inputTrace: seq<RuntimeStepInput>,
  stepWitness: seq<RuntimeStepResult>,
  j: nat
) returns (ghost allBeforeJOk: bool, jStepResult: FResult<RuntimeStepResult>, ghost jStepExecuteCallToolSucceeded: bool)
  requires LinkedTraceByWitness(obsTrace, inputTrace, stepWitness, j)
  requires PBeforeJAlwaysToolCall(obsTrace, inputTrace, j)
  requires PAtJNoMoreToolCall(obsTrace, inputTrace, j)
  requires PAtJFinishStateOutcome(obsTrace, inputTrace, j)
  requires |obsTrace[j].instructionResults| > 0
  requires (forall i :: 0 <= i < j ==>
    (!inputTrace[i].context.present || inputTrace[i].context.phase != PhaseHumanApprovedTool) &&
    obsTrace[i].initialContext.phase != PhaseHumanApprovedTool)
  requires (forall i :: 0 <= i < j ==>
    StepProgressP(
      if inputTrace[i].context.present then inputTrace[i].context else obsTrace[i].initialContext,
      inputTrace[i].state,
      obsTrace[i].runnerResult
    ))
  requires (!inputTrace[j].context.present || inputTrace[j].context.phase != PhaseHumanApprovedTool)
  requires obsTrace[j].initialContext.phase != PhaseHumanApprovedTool
  ensures allBeforeJOk
  ensures jStepResult.Ok?
  ensures obsTrace[j].finishResult.newState.status == StatusDone
{
  allBeforeJOk := JBoundedProgressThenFinish(obsTrace, inputTrace, stepWitness, j);
  jStepResult, jStepExecuteCallToolSucceeded := RuntimeStep(obsTrace[j], inputTrace[j]);
  assert jStepResult.Ok?;
  assert obsTrace[j].runnerResult.Ok?;
  assert |obsTrace[j].instructionResults| > 0;
}
