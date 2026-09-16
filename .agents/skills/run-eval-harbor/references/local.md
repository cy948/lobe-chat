# Local Target

Use this route for a production LobeHub build from this checkout. Port `3010`
is development-only; Harbor always targets the production server on `3210`.

## Prepare

Create `docker-compose/eval/.env` from `.env.example` only when it is absent.
Set the user-selected `LH_AGENT_ID`. The agent already owns its model. Ask
whether its provider credential is stored in LobeHub; when it is not, add the
provider's actual environment variable to this ignored env before server
startup. `DEEPSEEK_API_KEY` is one example, not a required or generic key.

```bash
bash .agents/skills/run-eval-harbor/scripts/bootstrap.sh
bun --env-file=docker-compose/eval/.env run build
bash .agents/skills/run-eval-harbor/scripts/server.sh
```

`server.sh` is long-running. Bootstrap starts PostgreSQL, Redis, RustFS, QStash,
Device Gateway, and Agent Gateway, migrates the database, then seeds the eval
user and CLI key. Keep `.records/env/eval-harbor-cli.env` private.

For CLI mode `checkout`, also run:

```bash
pnpm --dir apps/cli build
```

CLI mode `npm` installs the published `@lobehub/cli` in each Harbor task and
does not require a local CLI build.

## Addresses

LobeHub uses localhost service URLs. Harbor containers need host addresses:

```env
LH_SERVER_URL=http://172.17.0.1:3210
LH_GATEWAY_URL=http://172.17.0.1:8787
AGENT_GATEWAY_URL=http://172.17.0.1:8788
```

Resolve the bridge gateway instead of assuming `172.17.0.1`:

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'
```

## Gate Before A Real Job

Run the local service preflight, then the model-backed smoke with the selected
CLI mode. Both must pass before running or resuming a real Harbor job.

```bash
bash .agents/skills/run-eval-harbor/scripts/preflight.sh local
bash .agents/skills/run-eval-harbor/scripts/preflight.sh local /absolute/eval/repo
bash .agents/skills/run-eval-harbor/scripts/run-smoke.sh local checkout /absolute/eval/repo
# or: run-smoke.sh local npm /absolute/eval/repo
```

The smoke requires `LH_AGENT_ID` and `LOBEHUB_CLI_API_KEY`, calls the selected
agent, requires `hello world`, and exits. Preflight intentionally checks neither
credential nor model access; that is smoke's job.

Use the external eval repository's own run/resume command after smoke. Inspect
failures from `<jobs-dir>/<job-id>/job.log`, then the failed trial's
`exception.txt`, `agent/setup/`, `agent/command-*/`, and `verifier/` artifacts.

## Stop

```bash
docker compose --env-file docker-compose/eval/.env \
  -f docker-compose/eval/docker-compose.yml down
```

Do not add `-v` unless the user explicitly asks to discard eval data.
