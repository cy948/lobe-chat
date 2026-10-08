#!/usr/bin/env python3
"""Run FrontierHarness tasks locally against a LobeHub Cloud agent."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import tomllib
from datetime import datetime, timezone
from pathlib import Path

from lh.env import credentials

SUITES = {
    "terminal-bench": ("harbor", "lh.agent:LhInstalledAgent"),
    "datacurve": ("pier", "lh.pier_agent:LhPierInstalledAgent"),
}
SCRIPT_DIR = Path(__file__).resolve().parent


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def start(args: argparse.Namespace) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", args.run_id):
        raise ValueError("run-id must contain only letters, digits, dots, dashes and underscores")
    eval_dir = args.eval_dir.resolve()
    cli_dir = args.cli_dir.resolve()
    env_file = args.env_file.resolve()
    for required in (cli_dir / "package.json", cli_dir / "dist/index.js", eval_dir / "benchmark.json"):
        if not required.is_file():
            raise FileNotFoundError(required)
    creds = credentials(env_file)
    if args.after_run and (args.after_pid is None or args.after_pid < 1):
        raise ValueError("--after-run requires a positive --after-pid")
    notify_dir = Path.home() / "scripts"
    if args.notify and not all((notify_dir / name).is_file() for name in ("notify-on-exit.sh", ".env")):
        raise FileNotFoundError("notification script or its .env is missing")
    sources = {
        "terminal-bench": args.terminal_bench.resolve(),
        "datacurve": (args.deep_swe.resolve() / "tasks"),
    }
    if not all(path.is_dir() for path in sources.values()):
        raise ValueError("Terminal-Bench or DeepSWE task directory is missing")
    network_script = eval_dir / "skills/frontierharness-eval/scripts/set-agent-network-mode.py"
    if not network_script.is_file():
        raise FileNotFoundError(network_script)

    tasks = []
    for task in sorted((eval_dir / "tasks").glob("*/task.toml")):
        task_id = tomllib.loads(task.read_text())["task"]["name"]
        if args.task and task_id not in args.task:
            continue
        suite, _, _ = task_id.partition("/")
        if suite not in SUITES:
            raise ValueError(f"unknown FrontierHarness suite: {task_id}")
        source = sources[suite] / task.parent.name
        if not (source / "task.toml").is_file():
            raise FileNotFoundError(source / "task.toml")
        source_task = tomllib.loads((source / "task.toml").read_text())
        source_name = source_task.get("task", {}).get("name")
        if suite == "terminal-bench" and source_name is None:
            source_name = f"terminal-bench/{source.name}"
        if source_name != task_id:
            raise ValueError(f"task identity differs from the benchmark: {task_id}")
        tasks.append({"id": task_id, "suite": suite, "dir": task.parent.name})
    if args.task and set(args.task) != {task["id"] for task in tasks}:
        raise ValueError("requested task is not in the FrontierHarness benchmark")
    if not args.task and len(tasks) != 30:
        raise ValueError(f"expected 30 FrontierHarness tasks, found {len(tasks)}")

    run_dir = (args.out.resolve() / args.run_id)
    if run_dir.exists():
        raise FileExistsError(f"run already exists: {run_dir}")
    run_dir.mkdir(parents=True)
    for task in tasks:
        suite, name = task["suite"], task["dir"]
        target = run_dir / "tasks" / suite / name
        shutil.copytree(sources[suite] / name, target)
        subprocess.run([sys.executable, str(network_script), str(target / "task.toml"), "public"], check=True)
        runner, adapter = SUITES[suite]
        agent = {
            "model_name": args.model,
            "env": {
                **{key: "${" + key + "}" for key in creds},
                "LH_CLI_SOURCE": f"host-dir:{cli_dir}",
                "LH_RUN_MODE": "agent",
            },
        }
        agent["name" if runner == "harbor" else "import_path"] = adapter
        job_name = f"{args.run_id}-{name}"
        config = {
            "job_name": job_name,
            "jobs_dir": str(run_dir / "jobs" / suite),
            "n_concurrent_trials": 1,
            "retry": {"max_retries": 0},
            "tasks": [{"path": str(target)}],
            "environment": {"type": "docker"},
            "agents": [agent],
        }
        save(run_dir / "config" / suite / f"{name}.json", config)
    record = {
        "run_id": args.run_id,
        "model": args.model,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "topology": "docker-host-sequential",
        "eval_commit": subprocess.check_output(["git", "-C", str(eval_dir), "rev-parse", "HEAD"], text=True).strip(),
        "deep_swe_commit": subprocess.check_output(["git", "-C", str(args.deep_swe), "rev-parse", "HEAD"], text=True).strip(),
        "cli_sha256": hashlib.sha256((cli_dir / "dist/index.js").read_bytes()).hexdigest(),
        "env_file": str(env_file),
        "agent_id": creds["LH_AGENT_ID"],
        "tasks": tasks,
    }
    if args.after_run:
        record["after_run"] = str(args.after_run.resolve())
        record["after_pid"] = args.after_pid
    save(run_dir / "run.json", record)
    save(run_dir / "status.json", {"state": "queued", "total": len(tasks)})
    command = [sys.executable, str(Path(__file__).resolve()), "worker", "--run", str(run_dir)]
    if args.notify:
        notifier = notify_dir / "notify-on-exit.sh"
        command = [
            str(notifier), "--title", f"FrontierHarness local: {args.run_id}",
            "--content", f"Result directory: {run_dir}", "--", *command,
        ]
    with (run_dir / "worker.log").open("a") as log:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            cwd=notify_dir if args.notify else run_dir,
            start_new_session=True,
        )
    (run_dir / "worker.pid").write_text(f"{process.pid}\n")
    print(json.dumps({"run": str(run_dir), "pid": process.pid, "tasks": len(tasks)}, indent=2))


def worker(args: argparse.Namespace) -> None:
    run_dir = args.run.resolve()
    record = json.loads((run_dir / "run.json").read_text())
    if "after_run" in record:
        previous = Path(record["after_run"])
        while True:
            state_file = previous / "status.json"
            state = json.loads(state_file.read_text()).get("state") if state_file.is_file() else ""
            if state == "complete":
                break
            if state == "failed":
                save(run_dir / "status.json", {"state": "failed", "reason": f"smoke failed: {previous}"})
                raise SystemExit(1)
            try:
                os.kill(record["after_pid"], 0)
            except ProcessLookupError:
                save(run_dir / "status.json", {"state": "failed", "reason": f"smoke stopped without completion: {previous}"})
                raise SystemExit(1)
            time.sleep(30)
    env = os.environ.copy()
    for key in ("LH_SERVER_URL", "LOBEHUB_SERVER", "LH_GATEWAY_URL", "AGENT_GATEWAY_URL", "LH_AGENT_SLUG"):
        env.pop(key, None)
    env.update(credentials(Path(record["env_file"])))
    env["PYTHONPATH"] = str(SCRIPT_DIR) + (":" + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    for index, task in enumerate(record["tasks"], 1):
        suite, name = task["suite"], task["dir"]
        runner = SUITES[suite][0]
        config = run_dir / "config" / suite / f"{name}.json"
        command = (["uv", "run", "--with", "harbor==0.23.0", "harbor"] if runner == "harbor" else ["pier"])
        command += ["run", "--config", str(config), "--yes"]
        save(run_dir / "status.json", {"state": "running", "index": index, "total": len(record["tasks"]), "task": task["id"]})
        log_path = run_dir / "logs" / suite / f"{name}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("w") as log:
            result = subprocess.run(command, cwd=run_dir, env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
        result_path = run_dir / "jobs" / suite / f"{record['run_id']}-{name}" / "result.json"
        if result.returncode or not result_path.is_file():
            save(run_dir / "status.json", {"state": "failed", "index": index, "task": task["id"], "exit_code": result.returncode, "log": str(log_path)})
            raise SystemExit(result.returncode or 1)
        print(f"{index}/{len(record['tasks'])}: {task['id']} -> {result_path}", flush=True)
    save(run_dir / "status.json", {
        "state": "complete", "total": len(record["tasks"]),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    })


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start_parser = commands.add_parser("start")
    start_parser.add_argument("--run-id", required=True)
    start_parser.add_argument("--eval-dir", type=Path, required=True)
    start_parser.add_argument("--terminal-bench", type=Path, required=True)
    start_parser.add_argument("--deep-swe", type=Path, required=True)
    start_parser.add_argument("--env-file", type=Path, required=True)
    start_parser.add_argument("--cli-dir", type=Path, default=SCRIPT_DIR.parents[3] / "apps/cli")
    start_parser.add_argument("--out", type=Path, default=Path("runs"))
    start_parser.add_argument("--model", default="kimi-k3")
    start_parser.add_argument("--task", action="append")
    start_parser.add_argument("--after-run", type=Path, help="wait for a smoke run to finish successfully")
    start_parser.add_argument("--after-pid", type=int, help="fail if the smoke worker exits without a result")
    start_parser.add_argument("--notify", action="store_true", help="send a notification when the worker exits")
    start_parser.set_defaults(handler=start)
    worker_parser = commands.add_parser("worker", help=argparse.SUPPRESS)
    worker_parser.add_argument("--run", type=Path, required=True)
    worker_parser.set_defaults(handler=worker)
    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
