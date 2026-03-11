import { readFileSync } from 'node:fs';

import type { Command } from 'commander';
import pc from 'picocolors';

import type { TrpcClient } from '../api/client';
import { getTrpcClient } from '../api/client';
import { getAuthInfo } from '../api/http';
import { replayAgentEvents, streamAgentEvents } from '../utils/agentStream';
import { bindCurrentDeviceToTopic } from '../utils/deviceBinding';
import { confirm, outputJson, printTable, truncate } from '../utils/format';
import { log, setVerbose } from '../utils/logger';

const TERMINAL_AGENT_STATUSES = new Set(['done', 'error', 'interrupted']);
const STATUS_FALLBACK_INTERVAL = 1000;

type OperationStatus = Awaited<ReturnType<TrpcClient['aiAgent']['getOperationStatus']['query']>>;
type TopicMessages = Awaited<ReturnType<TrpcClient['message']['getMessages']['query']>>;

const isTerminalOperationStatus = (status: OperationStatus): boolean => {
  if (!status) return false;
  if (status.isCompleted || status.hasError) return true;

  return TERMINAL_AGENT_STATUSES.has(status.currentState?.status || '');
};

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });

const waitForTerminalOperationStatus = async (
  client: TrpcClient,
  operationId: string,
  signal: AbortSignal,
): Promise<OperationStatus> => {
  while (!signal.aborted) {
    try {
      const status = await client.aiAgent.getOperationStatus.query({ operationId });

      if (isTerminalOperationStatus(status)) {
        return status;
      }
    } catch (error) {
      log.debug(`Status fallback check failed for ${operationId}: ${String(error)}`);
    }

    await wait(STATUS_FALLBACK_INTERVAL, signal);
  }

  return null;
};

const renderStatusFallback = (status: NonNullable<OperationStatus>, json?: boolean) => {
  const terminalEvent = {
    data: {
      finalState: status.currentState,
      operationId: status.operationId,
      phase: 'execution_complete',
      reason:
        status.currentState.status === 'interrupted'
          ? 'interrupted'
          : status.currentState.status === 'error'
            ? 'error'
            : 'completed',
      reasonDetail: 'Agent stream did not terminate cleanly; CLI exited via status fallback.',
    },
    operationId: status.operationId,
    stepIndex: status.currentState.stepCount || 0,
    timestamp: Date.now(),
    type: 'agent_runtime_end',
  };

  if (json) {
    console.log(JSON.stringify([terminalEvent], null, 2));
    return;
  }

  console.log();

  if (status.currentState.status === 'error') {
    const errorText =
      typeof status.currentState.error === 'string'
        ? status.currentState.error
        : status.currentState.error
          ? JSON.stringify(status.currentState.error, null, 2)
          : 'Unknown runtime error';

    log.error(`Agent failed (status fallback): ${errorText}`);
    return;
  }

  const parts: string[] = [`${pc.green('✓')} Agent finished ${pc.dim('(status fallback)')}`];
  const stepCount = status.currentState.stepCount;
  const totalTokens = status.currentState.usage?.total_tokens;
  const totalCost = status.currentState.cost?.total;

  if (stepCount !== undefined) {
    parts.push(`${stepCount} step${stepCount !== 1 ? 's' : ''}`);
  }
  if (totalTokens) {
    parts.push(`${totalTokens} tokens`);
  }
  if (totalCost !== undefined) {
    parts.push(`$${totalCost.toFixed(4)}`);
  }

  console.log(parts.join(pc.dim(' · ')));
};

const getLatestAssistantMessage = async (
  client: TrpcClient,
  topicId?: string | null,
): Promise<string | null> => {
  if (!topicId) return null;

  try {
    const messages = (await client.message.getMessages.query({
      current: 0,
      pageSize: 200,
      topicId,
    })) as TopicMessages;

    if (!Array.isArray(messages)) return null;

    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message?.role === 'assistant' && typeof message.content === 'string');

    return latestAssistant?.content?.trim() || null;
  } catch (error) {
    log.debug(`Failed to load fallback assistant message for topic ${topicId}: ${String(error)}`);
    return null;
  }
};

/**
 * Resolve an agent identifier (agentId or slug) to a concrete agentId.
 * When a slug is provided, uses getBuiltinAgent to look up the agent.
 */
async function resolveAgentId(
  client: any,
  opts: { agentId?: string; slug?: string },
): Promise<string> {
  if (opts.agentId) return opts.agentId;

  if (opts.slug) {
    const agent = await client.agent.getBuiltinAgent.query({ slug: opts.slug });
    if (!agent) {
      log.error(`Agent not found for slug: ${opts.slug}`);
      process.exit(1);
    }
    return (agent as any).id || (agent as any).agentId;
  }

  log.error('Either <agentId> or --slug is required.');
  process.exit(1);
  return ''; // unreachable
}

export function registerAgentCommand(program: Command) {
  const agent = program.command('agent').description('Manage agents');

  // ── list ──────────────────────────────────────────────

  agent
    .command('list')
    .description('List agents')
    .option('-L, --limit <n>', 'Maximum number of items', '30')
    .option('-k, --keyword <keyword>', 'Filter by keyword')
    .option('--json [fields]', 'Output JSON, optionally specify fields (comma-separated)')
    .action(async (options: { json?: string | boolean; keyword?: string; limit?: string }) => {
      const client = await getTrpcClient();

      const input: { keyword?: string; limit?: number; offset?: number } = {};
      if (options.keyword) input.keyword = options.keyword;
      if (options.limit) input.limit = Number.parseInt(options.limit, 10);

      const result = await client.agent.queryAgents.query(input);
      const items = Array.isArray(result) ? result : ((result as any).items ?? []);

      if (options.json !== undefined) {
        const fields = typeof options.json === 'string' ? options.json : undefined;
        outputJson(items, fields);
        return;
      }

      if (items.length === 0) {
        console.log('No agents found.');
        return;
      }

      const rows = items.map((a: any) => [
        a.id || a.agentId || '',
        truncate(a.title || a.name || a.meta?.title || 'Untitled', 40),
        truncate(a.description || a.meta?.description || '', 50),
        a.model || '',
      ]);

      printTable(rows, ['ID', 'TITLE', 'DESCRIPTION', 'MODEL']);
    });

  // ── view ──────────────────────────────────────────────

  agent
    .command('view [agentId]')
    .description('View agent configuration')
    .option('-s, --slug <slug>', 'Agent slug (e.g. inbox)')
    .option('--json [fields]', 'Output JSON, optionally specify fields (comma-separated)')
    .action(
      async (
        agentIdArg: string | undefined,
        options: { json?: string | boolean; slug?: string },
      ) => {
        const client = await getTrpcClient();
        const agentId = await resolveAgentId(client, { agentId: agentIdArg, slug: options.slug });
        const result = await client.agent.getAgentConfigById.query({ agentId });

        if (!result) {
          log.error(`Agent not found: ${agentId}`);
          process.exit(1);
          return;
        }

        if (options.json !== undefined) {
          const fields = typeof options.json === 'string' ? options.json : undefined;
          outputJson(result, fields);
          return;
        }

        const r = result as any;
        console.log(pc.bold(r.title || r.meta?.title || 'Untitled'));
        const meta: string[] = [];
        if (r.description || r.meta?.description) meta.push(r.description || r.meta.description);
        if (r.model) meta.push(`Model: ${r.model}`);
        if (r.provider) meta.push(`Provider: ${r.provider}`);
        if (meta.length > 0) console.log(pc.dim(meta.join(' · ')));

        if (r.systemRole) {
          console.log();
          console.log(pc.bold('System Role:'));
          console.log(r.systemRole);
        }
      },
    );

  // ── create ────────────────────────────────────────────

  agent
    .command('create')
    .description('Create a new agent')
    .option('-t, --title <title>', 'Agent title')
    .option('-d, --description <desc>', 'Agent description')
    .option('-m, --model <model>', 'Model ID')
    .option('-p, --provider <provider>', 'Provider ID')
    .option('-s, --system-role <role>', 'System role prompt')
    .option('--group <groupId>', 'Group ID')
    .action(
      async (options: {
        description?: string;
        group?: string;
        model?: string;
        provider?: string;
        systemRole?: string;
        title?: string;
      }) => {
        const client = await getTrpcClient();

        const config: Record<string, any> = {};
        if (options.title) config.title = options.title;
        if (options.description) config.description = options.description;
        if (options.model) config.model = options.model;
        if (options.provider) config.provider = options.provider;
        if (options.systemRole) config.systemRole = options.systemRole;

        const input: Record<string, any> = { config };
        if (options.group) input.groupId = options.group;

        const result = await client.agent.createAgent.mutate(input as any);
        const r = result as any;
        console.log(`${pc.green('✓')} Created agent ${pc.bold(r.agentId || r.id)}`);
        if (r.sessionId) console.log(`  Session: ${r.sessionId}`);
      },
    );

  // ── edit ──────────────────────────────────────────────

  agent
    .command('edit [agentId]')
    .description('Update agent configuration')
    .option('--slug <slug>', 'Agent slug (e.g. inbox)')
    .option('-t, --title <title>', 'New title')
    .option('-d, --description <desc>', 'New description')
    .option('-m, --model <model>', 'New model ID')
    .option('-p, --provider <provider>', 'New provider ID')
    .option('-s, --system-role <role>', 'New system role prompt')
    .action(
      async (
        agentIdArg: string | undefined,
        options: {
          description?: string;
          model?: string;
          provider?: string;
          slug?: string;
          systemRole?: string;
          title?: string;
        },
      ) => {
        const value: Record<string, any> = {};
        if (options.title) value.title = options.title;
        if (options.description) value.description = options.description;
        if (options.model) value.model = options.model;
        if (options.provider) value.provider = options.provider;
        if (options.systemRole) value.systemRole = options.systemRole;

        if (Object.keys(value).length === 0) {
          log.error(
            'No changes specified. Use --title, --description, --model, --provider, or --system-role.',
          );
          process.exit(1);
        }

        const client = await getTrpcClient();
        const agentId = await resolveAgentId(client, { agentId: agentIdArg, slug: options.slug });
        await client.agent.updateAgentConfig.mutate({ agentId, value });
        console.log(`${pc.green('✓')} Updated agent ${pc.bold(agentId)}`);
      },
    );

  // ── delete ────────────────────────────────────────────

  agent
    .command('delete <agentId>')
    .description('Delete an agent')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (agentId: string, options: { yes?: boolean }) => {
      if (!options.yes) {
        const confirmed = await confirm('Are you sure you want to delete this agent?');
        if (!confirmed) {
          console.log('Cancelled.');
          return;
        }
      }

      const client = await getTrpcClient();
      await client.agent.removeAgent.mutate({ agentId });
      console.log(`${pc.green('✓')} Deleted agent ${pc.bold(agentId)}`);
    });

  // ── duplicate ─────────────────────────────────────────

  agent
    .command('duplicate <agentId>')
    .description('Duplicate an agent')
    .option('-t, --title <title>', 'Title for the duplicate')
    .action(async (agentId: string, options: { title?: string }) => {
      const client = await getTrpcClient();
      const input: Record<string, any> = { agentId };
      if (options.title) input.newTitle = options.title;

      const result = await client.agent.duplicateAgent.mutate(input as any);
      const r = result as any;
      console.log(`${pc.green('✓')} Duplicated agent → ${pc.bold(r.agentId || r.id || 'done')}`);
    });

  // ── run ──────────────────────────────────────────────

  agent
    .command('run')
    .description('Run an agent with a prompt')
    .option('-a, --agent-id <id>', 'Agent ID')
    .option('-s, --slug <slug>', 'Agent slug')
    .option('-p, --prompt <text>', 'User prompt')
    .option('-t, --topic-id <id>', 'Reuse an existing topic')
    .option('--bind-current-device', 'Bind the current CLI device to the topic before running')
    .option('--no-auto-start', 'Do not auto-start the agent')
    .option('--json', 'Output full JSON event stream')
    .option('-v, --verbose', 'Show detailed tool call info')
    .option('--replay <file>', 'Replay events from a saved JSON file (offline)')
    .action(
      async (options: {
        agentId?: string;
        autoStart?: boolean;
        bindCurrentDevice?: boolean;
        json?: boolean;
        prompt?: string;
        replay?: string;
        slug?: string;
        topicId?: string;
        verbose?: boolean;
      }) => {
        if (options.verbose) setVerbose(true);

        // Replay mode: render from saved JSON file, no network needed
        if (options.replay) {
          const data = readFileSync(options.replay, 'utf8');
          const events = JSON.parse(data);
          replayAgentEvents(events, { json: options.json, verbose: options.verbose });
          return;
        }

        if (!options.agentId && !options.slug) {
          log.error('Either --agent-id or --slug is required.');
          process.exit(1);
          return;
        }
        if (!options.prompt) {
          log.error('--prompt is required.');
          process.exit(1);
          return;
        }
        if (options.bindCurrentDevice && !options.topicId) {
          log.error('--bind-current-device requires --topic-id.');
          process.exit(1);
          return;
        }

        const client = await getTrpcClient();

        if (options.bindCurrentDevice) {
          const boundDeviceId = await bindCurrentDeviceToTopic(client, options.topicId!);
          if (!boundDeviceId) return;
        }

        // 1. Exec agent to get operationId
        const input: Record<string, any> = { prompt: options.prompt };
        if (options.agentId) input.agentId = options.agentId;
        if (options.slug) input.slug = options.slug;
        if (options.topicId) input.appContext = { topicId: options.topicId };
        if (options.autoStart === false) input.autoStart = false;
        if (options.bindCurrentDevice) input.requireBoundDeviceOnline = true;

        const result = await client.aiAgent.execAgent.mutate(input as any);
        const r = result as any;

        if (!r.success) {
          log.error(`Failed to start agent: ${r.error || r.message || 'Unknown error'}`);
          process.exit(1);
        }

        const operationId = r.operationId;
        const resolvedTopicId = r.topicId || options.topicId;
        if (!options.json) {
          log.info(
            `Operation: ${pc.dim(operationId)} · Topic: ${pc.dim(resolvedTopicId || 'n/a')}`,
          );
        }

        // 2. Connect to SSE stream
        const { serverUrl, headers } = await getAuthInfo();
        const streamUrl = `${serverUrl}/api/agent/stream?operationId=${encodeURIComponent(operationId)}&includeHistory=true`;
        const abortController = new AbortController();
        let settled = false;
        let exitCode = 0;

        const settle = () => {
          if (settled) return false;
          settled = true;
          return true;
        };

        const streamPromise = (async () => {
          await streamAgentEvents(streamUrl, headers, {
            json: options.json,
            signal: abortController.signal,
            verbose: options.verbose,
          });

          if (settle()) {
            abortController.abort();
          }
        })();

        const statusFallbackPromise = (async () => {
          const status = await waitForTerminalOperationStatus(
            client as TrpcClient,
            operationId,
            abortController.signal,
          );

          if (!status || !settle()) return;

          abortController.abort();
          const fallbackContent = await getLatestAssistantMessage(
            client as TrpcClient,
            resolvedTopicId,
          );

          if (!options.json && fallbackContent) {
            console.log();
            console.log(fallbackContent);
          }

          renderStatusFallback(status, options.json);

          if (
            status.currentState.status === 'error' ||
            status.currentState.status === 'interrupted'
          ) {
            exitCode = 1;
          }
        })();

        await Promise.race([streamPromise, statusFallbackPromise]);
        abortController.abort();
        await Promise.allSettled([streamPromise, statusFallbackPromise]);

        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      },
    );

  // ── status ──────────────────────────────────────────

  agent
    .command('status <operationId>')
    .description('Check agent operation status')
    .option('--json [fields]', 'Output JSON, optionally specify fields (comma-separated)')
    .option('--history', 'Include step history')
    .option('--history-limit <n>', 'Number of history entries', '10')
    .action(
      async (
        operationId: string,
        options: { history?: boolean; historyLimit?: string; json?: string | boolean },
      ) => {
        const client = await getTrpcClient();

        const input: Record<string, any> = { operationId };
        if (options.history) input.includeHistory = true;
        if (options.historyLimit) input.historyLimit = Number.parseInt(options.historyLimit, 10);

        const result = await client.aiAgent.getOperationStatus.query(input as any);
        const r = result as any;

        if (options.json !== undefined) {
          const fields = typeof options.json === 'string' ? options.json : undefined;
          outputJson(r, fields);
          return;
        }

        console.log(pc.bold('Operation Status'));
        console.log(`  ID:     ${operationId}`);
        console.log(`  Status: ${colorStatus(r.status || r.state || 'unknown')}`);

        if (r.stepCount !== undefined) console.log(`  Steps:  ${r.stepCount}`);
        if (r.usage?.total_tokens) console.log(`  Tokens: ${r.usage.total_tokens}`);
        if (r.cost?.total !== undefined) console.log(`  Cost:   $${r.cost.total.toFixed(4)}`);
        if (r.error) console.log(`  Error:  ${pc.red(r.error)}`);
        if (r.createdAt) console.log(`  Started: ${r.createdAt}`);
        if (r.completedAt) console.log(`  Ended:   ${r.completedAt}`);
      },
    );
}

function colorStatus(status: string): string {
  switch (status) {
    case 'completed':
    case 'success': {
      return pc.green(status);
    }
    case 'failed':
    case 'error': {
      return pc.red(status);
    }
    case 'processing':
    case 'running': {
      return pc.yellow(status);
    }
    default: {
      return pc.dim(status);
    }
  }
}
