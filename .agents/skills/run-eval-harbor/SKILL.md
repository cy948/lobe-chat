---
name: run-eval-harbor
description: 'Run and diagnose existing Harbor or FrontierHarness evaluations against local production LobeHub, LobeHub Cloud, or Runta. Use for eval infrastructure, target preflight, lh CLI injection, Harbor smoke or job runs, resume, and failure triage. Excludes authoring Harbor tasks and product acceptance.'
---

# Run Eval Harbor

Run existing Harbor evaluations against either this checkout's isolated local
production harness or a remote LobeHub target. Use `create-task` to author or
grade tasks and `acceptance` for product acceptance.

## Ask First

Before preparing or running anything, obtain these independent choices:

1. Target: `local` production server from this checkout, `cloud`/remote, or
   `runta` FrontierHarness evaluation.
2. CLI: `checkout` build from `apps/cli`, or published `npm` release.
3. Agent selection: cloud and Runta require an exact `LH_AGENT_ID`; local uses
   the seeded user's builtin `inbox` agent unless the user explicitly selects a
   different agent.
4. Eval repository path and whether the user wants a new job or a resume.
5. Credentials: for cloud, require its CLI API key in the eval repository's
   ignored `.env`. Local bootstrap seeds its CLI key. Reuse a provider
   credential already configured in LobeHub or the ignored local env; if the
   smoke reports `InvalidProviderAPIKey`, report the resolved agent's
   provider/model and ask only for that provider's real credential.
6. For local, obtain explicit confirmation that port `3210` and every configured
   eval infrastructure port are unreachable from the public internet and other
   untrusted networks. Do not bootstrap the local stack without confirmation.

For the `runta` route, also collect the harness repository and pinned commit,
provider/key choice required by FrontierHarness, and the Terminal-Bench versus
DeepSWE task subset. The Lh Cloud agent's model remains selected by `LH_AGENT_ID`;
do not replace it with FrontierHarness's `--model` unless the run is explicitly
non-comparable.

Do not infer these choices. DeepSeek is only one provider example, not a
required credential or model.

## Guardrails

- In local mode, run LobeHub on port `3210` with `bun run start`; never target a
  dev server or port `3010`. Compose owns infrastructure; LobeHub stays on the
  host.
- In cloud mode, never start local infrastructure or rewrite server/gateway
  addresses. Official Cloud should use the CLI's default addresses.
- Create `docker-compose/eval/.env` from `.env.example` only when absent; never
  overwrite an existing file.
- The local Compose stack publishes host ports and uses fixed development
  credentials, including the seeded CLI key and gateway service token. Never
  run it on a host where those ports are reachable by an untrusted network.
- Never infer `inbox` for cloud or Runta, choose a separate model, or override
  the agent with `DEFAULT_AGENT_CONFIG`. Local may resolve the isolated seeded
  user's builtin `inbox` through the authenticated CLI. Never invent, print, or
  commit secrets.
- LobeHub uses localhost service URLs. Harbor containers use Docker-reachable
  host URLs. Never interchange them.
- Preflight is target-specific and read-only: local checks the local production
  stack; cloud checks the remote server/gateways. It does not validate API keys,
  agents, provider credentials, or model access.
- Do not run a model-backed Harbor job without an explicit user request.
- Before every requested real job or resume, run the shared model-backed smoke
  for the chosen target and CLI mode. Stop if either preflight or smoke fails.

## Run

Read exactly one route after the answers above:

- Local target: [references/local.md](references/local.md)
- Cloud/remote target: [references/cloud.md](references/cloud.md)
- Runta/FrontierHarness evaluation: [references/runta.md](references/runta.md)

For `local` and `cloud`, CLI selection is orthogonal to the target:
`checkout` injects the built `apps/cli`; `npm` installs the release package.
Both routes run their preflight and then
`scripts/run-smoke.sh <local|cloud> <checkout|npm> ...` before the external eval
repository's own job command. The `runta` route uses two restored suite runtimes
and a detached start/status/collect workflow; do not substitute a normal Harbor
job for it.

Harbor and Pier default to `LH_RUN_MODE=agent`. Set `LH_RUN_MODE=task` to create
one persistent LobeHub Task per trial and run it on the connected eval device;
operation polling, output collection, usage evidence, and device cleanup remain
the same.

## Diagnose

- PostgreSQL, Redis, RustFS, QStash, or Compose state: local eval infrastructure.
- Port `3210`, migrations, API-key auth, or `/api/version`: LobeHub.
- Ports `8787`/`8788`, gateway health, or service tokens: gateway.
- Docker-only connectivity: bridge address, published port, or host firewall.
- CLI upload/install: `LH_CLI_SOURCE` or `apps/cli/dist`.
- Reward/verifier behavior: the Harbor task; use `create-task` before changing it.

## Harbor Reference

For Harbor commands beyond these scripts, consult the official
[Harbor Skills](https://github.com/harbor-framework/skills), especially its
`harbor-cli` skill. This harness pins `harbor==0.23.0`; when guidance differs,
the pinned CLI's `--help` is authoritative.
