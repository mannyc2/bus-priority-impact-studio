import os
from pathlib import Path


def corpus_root() -> Path:
    env = os.environ.get("BP_CORPUS_ROOT")
    if env:
        return Path(env)
    if Path("/work/data/artifacts").is_dir():
        return Path("/work")
    p = Path.cwd()
    for _ in range(8):
        if (p / "data" / "artifacts").is_dir():
            return p
        if p.parent == p:
            break
        p = p.parent
    raise RuntimeError(
        "Could not locate corpus root. Set BP_CORPUS_ROOT or run from inside the repo."
    )


def artifacts() -> Path:
    return corpus_root() / "data" / "artifacts"


def findings_month(month: str) -> Path:
    return artifacts() / "findings" / month
