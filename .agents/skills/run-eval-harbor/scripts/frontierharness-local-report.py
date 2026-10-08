#!/usr/bin/env python3
"""Prepare local Harbor/Pier evidence for FrontierHarness's report scripts."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

from lh.env import credentials


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--eval-dir", required=True, type=Path)
    parser.add_argument("--cli-dir", required=True, type=Path)
    parser.add_argument("--env-file", type=Path, help="override the original worker's credential file")
    args = parser.parse_args()
    run_dir = args.run.resolve()
    eval_dir = args.eval_dir.resolve()
    record_path = run_dir / "run.json"
    record = json.loads(record_path.read_text())
    status = json.loads((run_dir / "status.json").read_text())
    if status["state"] != "complete":
        raise RuntimeError("local run has not completed")
    model = record["model"]
    env = os.environ.copy()
    for key in ("LH_SERVER_URL", "LOBEHUB_SERVER", "LH_GATEWAY_URL", "AGENT_GATEWAY_URL", "LH_AGENT_SLUG"):
        env.pop(key, None)
    env.update(credentials(args.env_file or Path(record["env_file"])))

    scripts = eval_dir / "skills/frontierharness-eval/scripts"
    sys.path.insert(0, str(scripts))
    spec = importlib.util.spec_from_file_location("fh_calculate_cost", scripts / "calculate-cost.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("FrontierHarness cost calculator is unavailable")
    calculator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(calculator)
    pricing = json.loads((scripts / "pricing.json").read_text())

    operations = {}
    for task in record["tasks"]:
        name, suite = task["dir"], task["suite"]
        job = run_dir / "jobs" / suite / f"{record['run_id']}-{name}"
        status_logs = list(job.rglob("operation-status.jsonl"))
        if len(status_logs) != 1:
            raise RuntimeError(f"expected one operation log: {job}")
        ids = {json.loads(line)["operationId"] for line in status_logs[0].read_text().splitlines()}
        if not ids:
            raise RuntimeError(f"no operation ID: {job}")
        operations[task["id"]] = ids

    cli = args.cli_dir.resolve() / "dist/index.js"
    year, month = map(int, record["started_at"][:7].split("-"))
    end = status.get("finished_at", datetime.now(timezone.utc).isoformat())
    end_year, end_month = map(int, end[:7].split("-"))
    usage = []
    while (year, month) <= (end_year, end_month):
        usage.extend(json.loads(subprocess.check_output(
            ["node", str(cli), "usage", "--month", f"{year:04d}-{month:02d}",
             "--agent-id", record["agent_id"], "--json"], text=True, env=env,
        )))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    all_ids = set().union(*operations.values())
    matched = [row for row in usage if (row.get("metadata") or {}).get("operationId") in all_ids]
    if {row["metadata"]["operationId"] for row in matched} != all_ids:
        raise RuntimeError("lh usage is missing one or more run operations")

    trials = run_dir / "trials"
    for task in record["tasks"]:
        name, suite = task["dir"], task["suite"]
        trial_dir = trials / f"{suite}__{name}"
        job_dir = trial_dir / "jobs"
        original = run_dir / "jobs" / suite / f"{record['run_id']}-{name}"
        trial_dir.mkdir(parents=True, exist_ok=True)
        if job_dir.is_symlink():
            job_dir.unlink()
        if not job_dir.exists():
            shutil.copytree(original, job_dir)
        agents = list(job_dir.rglob("operation-status.jsonl"))
        if len(agents) != 1:
            raise RuntimeError(f"expected one agent log: {job_dir}")
        rows = sorted(
            (row for row in matched if row["metadata"]["operationId"] in operations[task["id"]]),
            key=lambda row: row.get("createdAt", ""),
        )
        (agents[0].parent / "lh-usage.jsonl").write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
        )
        title_path = eval_dir / "tasks" / name / "task.toml"
        title = tomllib.loads(title_path.read_text()).get("metadata", {}).get("display_title", name)
        scored = calculator.calculate(trial_dir, model, "lh", pricing, True, True)
        trial = {
            "id": task["id"], "title": title, "suite": suite, "harness": "lh",
            "run_id": record["run_id"], "attempt": 1,
            "operations": sorted(operations[task["id"]]), "usage_requests": len(rows),
            **scored,
        }
        (trial_dir / "trial.json").write_text(json.dumps(trial, indent=2) + "\n")

    record.update({
        "harness": "lh", "model": model, "provider": "lobehub-cloud",
        "checkpoint": "none (local Docker)", "methodology_comparable": False,
        "egress_policy": {"mode": "public", "scope": "agent task"},
        "methodology_notes": [
            "Docker executes tasks sequentially on a shared host without checkpoint restores; image caches persist.",
            "Only the agent task network is public; verifier and environment policy remain task-defined.",
            f"The Cloud agent selects the model; {model} is the recorded reporting label and frozen benchmark prices are used for comparison.",
        ],
    })
    record_path.write_text(json.dumps(record, indent=2) + "\n")
    (run_dir / "lh-usage.json").write_text(json.dumps(matched, indent=2) + "\n")
    print(f"Prepared {len(record['tasks'])} trials; {len(matched)} usage requests across {len(all_ids)} operations")


if __name__ == "__main__":
    main()
