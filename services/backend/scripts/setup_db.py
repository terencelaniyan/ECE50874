"""
Run seed_from_csv then migrate_arsenals in the correct order.
Run from repo root so .env and data/balls.csv are found.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SEED_SCRIPT = REPO_ROOT / "services" / "backend" / "scripts" / "seed_from_csv.py"
MIGRATE_SCRIPT = (
    REPO_ROOT / "services" / "backend" / "scripts" / "migrate_arsenals.py"
)
TRAIN_SCRIPT = REPO_ROOT / "services" / "backend" / "scripts" / "train_model.py"


def main() -> None:
    if not REPO_ROOT.is_dir():
        raise RuntimeError(f"Repo root not found: {REPO_ROOT}")

    for script, name in [
        (SEED_SCRIPT, "seed_from_csv"),
        (MIGRATE_SCRIPT, "migrate_arsenals"),
        (TRAIN_SCRIPT, "train_model"),
    ]:
        if not script.exists():
            raise FileNotFoundError(f"Script not found: {script}")
        subprocess.run(
            [sys.executable, str(script)],
            cwd=REPO_ROOT,
            check=True,
        )
        print(f"Completed: {name}")

    print("Database setup finished.")


if __name__ == "__main__":
    main()
