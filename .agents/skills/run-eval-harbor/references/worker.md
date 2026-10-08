# FrontierHarness on a Docker host or SSH worker

This execution route uses LobeHub Cloud and a workspace agent. On an SSH worker,
execute the host commands there. Reuse the configured SSH host; keep the worker's
other services and evaluation environments intact.

Build the CLI on the controller. Transfer `apps/cli/package.json`, `apps/cli/dist/`
and this skill to an isolated harness directory; compare the bundle SHA-256 on
both hosts. The task adapters upload that bundle into each task container, so
the worker and tasks do not rebuild LobeHub or install the published lh package.
`run-smoke.sh` needs a Git repository root around the harness directory.

Prepare Node compatible with the CLI's package.json, uv, Harbor 0.23.0 and Pier
0.3.1. Pin the FrontierHarness checkout and DeepSWE corpus. Use the benchmark
task index and the complete Terminal-Bench/DeepSWE task sources, not only the
benchmark's metadata copies. Store the Cloud credential file with permissions
0600; do not put it in the transferred code archive.

Run Cloud preflight and the shared hello-world smoke on the execution host as
described in cloud.md. Then run a real case from each required suite. Inspect
the trial reward, exception and device logs before starting a full run; the host
runner's `state=complete` means its queue ended, not that every trial passed.

```bash
ROOT=/absolute/path/to/isolated/eval
SCRIPT="$ROOT/harness/.agents/skills/run-eval-harbor/scripts"
python3 "$SCRIPT/frontierharness-local.py" start \
  --run-id smoke-lh-YYYYMMDD \
  --eval-dir "$ROOT/benchmark" \
  --terminal-bench "$ROOT/datasets/terminal-bench/terminal-bench" \
  --deep-swe "$ROOT/datasets/deep-swe" \
  --env-file "$ROOT/benchmark/.env" \
  --cli-dir "$ROOT/harness/apps/cli" \
  --task terminal-bench/openssl-selfsigned-cert \
  --task datacurve/fastapi-deprecation-response-headers \
  --model kimi-k3 --out "$ROOT/runs"
```

The current host launcher runs tasks sequentially, using Harbor for
`terminal-bench/*` and Pier for `datacurve/*`. Omitting `--task` selects all 30
benchmark tasks. It starts a detached process and returns the run directory and
PID; `worker.log` and `status.json` survive the SSH connection closing. Optional
`--notify` wraps it in the execution host's `~/scripts/notify-on-exit.sh`, using
the `.env` in that directory. No persistent worker service is needed.

Only the copied task's agent network becomes public; verifier/environment
policy and timeouts stay unchanged. Record the shared host/image cache topology
and retain the non-comparable label; it is not a fresh checkpoint per task.

After completion, copy the original jobs and run record back and verify archive
hashes. Prepare per-task usage and FrontierHarness trial records with:

```bash
python3 "$SCRIPT/frontierharness-local-report.py" \
  --run /absolute/path/to/collected/run \
  --eval-dir /absolute/path/to/benchmark \
  --cli-dir /absolute/path/to/current/apps/cli \
  --env-file /absolute/path/to/controller/eval.env
```

The env override replaces the worker-only credential path. Agent-mode cost
comes from `lh usage`, matched to exact operation IDs across the run's months.
The run record's model label controls frozen-price calculations. Use the
FrontierHarness report skill to normalize, chart and share the result; preserve
actual billing separately from repriced token cost.
