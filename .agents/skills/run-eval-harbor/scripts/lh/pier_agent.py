from __future__ import annotations

import base64
import json
import shlex
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from pier.agents.installed.base import BaseInstalledAgent
from pier.environments.base import BaseEnvironment
from pier.models.agent.context import AgentContext
from pier.models.agent.install import AgentInstallSpec, InstallStep

_HOST_DIR_PREFIX = "host-dir:"
_DEV_CLI_DIR = "/opt/lh-dev"
_DEV_CLI_RUNNER = f"{_DEV_CLI_DIR}/run-lh.sh"
_CHECK_LH_PATH = "/installed-agent/check-lh.sh"
_RUN_AGENT_PATH = "/installed-agent/run-agent.js"
_CONNECT_SCRIPT = "/tmp/lh-connect-supervised.sh"
_LOGIN_READY = "/tmp/lh-login-ready"
_DEVICE_READY = "/tmp/lh-device-ready"
_SUPERVISOR_CONFIG = "/tmp/lh-supervisord.conf"
_SUPERVISOR_SOCKET = "/tmp/lh-supervisor.sock"
_TEMPLATE_DIR = Path(__file__).with_name("template")
_TEMPLATES = Environment(
    autoescape=False,
    keep_trailing_newline=True,
    loader=FileSystemLoader(_TEMPLATE_DIR),
    undefined=StrictUndefined,
)


class LhPierInstalledAgent(BaseInstalledAgent):
    """Pier adapter for the Lh CLI-backed agent.

    Pier has its own installed-agent base class and declarative install contract;
    this class intentionally mirrors the Harbor adapter without inheriting from it.
    """

    def __init__(
        self,
        logs_dir: Path,
        prompt_template_path: Path | str | None = None,
        version: str | None = None,
        extra_env: dict[str, str] | None = None,
        agent_id: str | None = None,
        server_url: str | None = None,
        gateway_url: str | None = None,
        cli_source: str | None = None,
        workspace_id: str | None = None,
        *args,
        **kwargs,
    ):
        self._agent_id = agent_id
        self._workspace_id = workspace_id
        self._server_url = server_url
        self._gateway_url = gateway_url
        self._cli_source_arg = cli_source
        super().__init__(
            *args,
            logs_dir=logs_dir,
            prompt_template_path=prompt_template_path,
            version=version,
            extra_env=extra_env,
            **kwargs,
        )

    @staticmethod
    def name() -> str:
        return "lh"

    def _value(self, direct: str | None, env_name: str, default: str = "") -> str:
        return (direct or self._get_env(env_name) or default).strip()

    @property
    def _cli_source(self) -> str:
        return self._value(self._cli_source_arg, "LH_CLI_SOURCE", "system")

    def _render_template(self, name: str, **values: object) -> str:
        return _TEMPLATES.get_template(name).render(**values)

    def _source_dir(self) -> str | None:
        if self._cli_source == "system":
            return None
        if not self._cli_source.startswith(_HOST_DIR_PREFIX):
            raise ValueError(f"Unsupported LH_CLI_SOURCE: {self._cli_source}")
        path = self._cli_source.removeprefix(_HOST_DIR_PREFIX).strip()
        if not path.startswith("/"):
            raise ValueError("LH_CLI_SOURCE host-dir path must be absolute")
        return path

    def _cli_command(self) -> str:
        self._source_dir()
        if self._cli_source == "system":
            return "lh"
        return f"bash {_DEV_CLI_RUNNER}"

    def _cli_path(self) -> str:
        self._source_dir()
        if self._cli_source == "system":
            return "/usr/local/bin/lh"
        return _DEV_CLI_RUNNER

    def _agent_target(self) -> tuple[str, str]:
        agent_id = self._value(self._agent_id, "LH_AGENT_ID")
        if not agent_id:
            raise ValueError("LH_AGENT_ID is required")
        return "--agent-id", agent_id

    @staticmethod
    def _write_file_command(path: str, contents: str) -> str:
        encoded = base64.b64encode(contents.encode()).decode()
        return f"printf %s {shlex.quote(encoded)} | base64 -d > {shlex.quote(path)}"

    def install_spec(self) -> AgentInstallSpec:
        source_dir = self._source_dir()
        install_script = self._render_template(
            "install-lh.sh.j2",
            cli_package=shlex.quote("@lobehub/cli"),
            node_version=shlex.quote(self._value(None, "LH_NODE_VERSION", "24")),
            install_cli=source_dir is None,
            use_system_cli=source_dir is None,
        )
        check_script = self._render_template("check-lh.sh.j2")
        run_script = self._render_template("run-agent.js")

        setup = "set -euo pipefail; mkdir -p /installed-agent /opt/lh-dev; "
        setup += self._write_file_command("/installed-agent/install-lh.sh", install_script)
        setup += "; " + self._write_file_command(_CHECK_LH_PATH, check_script)
        setup += "; " + self._write_file_command(_RUN_AGENT_PATH, run_script)
        setup += (
            f"; chmod +x /installed-agent/install-lh.sh {_CHECK_LH_PATH}; "
            "/installed-agent/install-lh.sh"
        )

        return AgentInstallSpec(
            agent_name=self.name(),
            version=self._version,
            steps=[InstallStep(user="root", run=setup)],
        )

    def create_run_agent_commands(self, instruction: str) -> list[str]:
        selector_flag, selector_value = self._agent_target()
        server_url = self._value(self._server_url, "LH_SERVER_URL")
        gateway_url = self._value(self._gateway_url, "LH_GATEWAY_URL")
        workspace_id = self._value(self._workspace_id, "LOBEHUB_WORKSPACE_ID")
        cli = self._cli_command()
        workspace_env = (
            f"export LOBEHUB_WORKSPACE_ID={shlex.quote(workspace_id)}; "
            if workspace_id
            else ""
        )

        login = (
            workspace_env
            + f"rm -f {_LOGIN_READY} {_DEVICE_READY}; "
            f"({cli} whoami >/dev/null 2>&1 || {cli} login"
        )
        if server_url:
            login += f" --server {shlex.quote(server_url)}"
        login += f") && touch {_LOGIN_READY}"

        connect = self._render_template(
            "connect-lh.sh.j2",
            cli_command=cli,
            connect_script=_CONNECT_SCRIPT,
            device_ready=_DEVICE_READY,
            gateway_url=shlex.quote(gateway_url) if gateway_url else "",
            login_ready=_LOGIN_READY,
            workspace_id=shlex.quote(workspace_id) if workspace_id else "",
            supervisor_config=_SUPERVISOR_CONFIG,
            supervisor_socket=_SUPERVISOR_SOCKET,
        )
        ready = (
            workspace_env
            + f"test -f {_LOGIN_READY} || exit 1; "
            f"{_CHECK_LH_PATH} -- {cli} && touch {_DEVICE_READY}"
        )
        run = (
            workspace_env
            + f"test -f {_LOGIN_READY} || exit 1; "
            f"node {shlex.quote(_RUN_AGENT_PATH)}"
            f" --cli {shlex.quote(self._cli_path())}"
            f" {selector_flag} {shlex.quote(selector_value)}"
            f" --prompt {shlex.quote(instruction)}"
            f" --device-ready {shlex.quote(_DEVICE_READY)}"
            f" --status-path \"$HOME/.lobehub/daemon.status.json\""
            f" --supervisor-config {shlex.quote(_SUPERVISOR_CONFIG)}"
        )
        return [login, connect, ready, run]

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        del context
        source_dir = self._source_dir()
        if source_dir is not None:
            await environment.upload_file(
                Path(source_dir) / "package.json", f"{_DEV_CLI_DIR}/package.json"
            )
            await environment.upload_dir(Path(source_dir) / "dist", f"{_DEV_CLI_DIR}/dist")
        for command in self.create_run_agent_commands(self.render_instruction(instruction)):
            await self.exec_as_agent(environment, command=command)

    def populate_context_post_run(self, context: AgentContext) -> None:
        snapshots = self.logs_dir / "operation-status.jsonl"
        try:
            lines = snapshots.read_text().splitlines()
        except OSError:
            return

        for line in reversed(lines):
            try:
                state = json.loads(line)["currentState"]
                tokens = state.get("usage", {}).get("llm", {}).get("tokens", {})
                cost = state.get("cost") or {}
                if isinstance(tokens.get("input"), int):
                    context.n_input_tokens = tokens["input"]
                if isinstance(tokens.get("output"), int):
                    context.n_output_tokens = tokens["output"]
                if cost.get("currency") == "USD" and isinstance(cost.get("total"), (int, float)):
                    context.cost_usd = cost["total"]
                model_costs = cost.get("llm", {}).get("byModel", [])
                cached = [
                    model.get("usage", {}).get("inputCachedTokens")
                    for model in model_costs
                    if isinstance(model, dict)
                ]
                if cached and all(isinstance(value, int) for value in cached):
                    context.n_cache_tokens = sum(cached)
                return
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
