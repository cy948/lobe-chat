// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const serviceSource = () => readFileSync(resolve(__dirname, '../AgentRuntimeService.ts'), 'utf8');

describe('terminal bench graph activation guard', () => {
  it('keeps GraphAgent behind the TB_GRAPH_AGENT opt-in switch', () => {
    const source = serviceSource();

    expect(source).toContain("process.env.TB_GRAPH_AGENT === '1'");
    expect(source).toContain('isTerminalBenchGraphEnabled()');
    expect(source).toContain('new GraphAgent({ ...config, graph: terminalBenchGraph })');
  });

  it('preserves explicit agentFactory precedence over the env-gated graph factory', () => {
    const source = serviceSource();

    expect(source).toContain('options?.agentFactory ??');
    expect(source.indexOf('options?.agentFactory ??')).toBeLessThan(
      source.indexOf('isTerminalBenchGraphEnabled()'),
    );
  });
});
