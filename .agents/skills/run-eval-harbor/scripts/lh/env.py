from pathlib import Path


def credentials(path: Path) -> dict[str, str]:
    values = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    required = ("LH_AGENT_ID", "LOBEHUB_CLI_API_KEY", "LOBEHUB_WORKSPACE_ID")
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise ValueError(f"missing Cloud credentials: {', '.join(missing)}")
    return {key: values[key] for key in required}
