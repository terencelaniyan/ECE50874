#!/usr/bin/env python3
"""
Manual bowling ball data entry CLI.

Provides an interactive prompt for entering bowling ball records one at a
time and appending them to data/balls.csv.  This is the fallback when
automated scraping is blocked.

Usage
-----
    python scripts/manual_entry.py                     # interactive mode
    python scripts/manual_entry.py --from-json input.json  # batch mode

JSON batch format
-----------------
[
  {
    "name": "Phaze V",
    "brand": "Storm",
    "rg": 2.48,
    "diff": 0.054,
    "int_diff": 0.018,
    "coverstock_type": "Solid Reactive",
    "surface_grit": "1500 Grit Polished",
    "release_date": "2025-01-01"
  }
]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

CSV_COLUMNS = [
    "name",
    "brand",
    "rg",
    "diff",
    "int_diff",
    "symmetry",
    "coverstock_type",
    "surface_grit",
    "surface_finish",
    "release_date",
    "status",
]

REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "data" / "balls.csv"


def _prompt(label: str, *, required: bool = False, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    suffix += " (required)" if required else ""
    while True:
        val = input(f"  {label}{suffix}: ").strip()
        if not val and default:
            return default
        if not val and required:
            print("    ↳ This field is required.")
            continue
        return val


def _prompt_float(
    label: str, *, required: bool = False, default: float = 0.0
) -> float:
    while True:
        raw = _prompt(label, required=required, default=str(default))
        try:
            return float(raw)
        except ValueError:
            print("    ↳ Must be a number.")


def interactive_entry() -> dict:
    """Prompt the user for a single bowling ball record."""
    print("\n── New bowling ball entry ──")

    name = _prompt("name", required=True)
    brand = _prompt("brand", required=True)
    rg = _prompt_float("rg", required=True)
    diff = _prompt_float("diff", required=True)
    int_diff = _prompt_float("int_diff", default=0.0)
    symmetry = "Asymmetric" if int_diff > 0 else "Symmetric"
    coverstock_type = _prompt("coverstock_type", default="")
    surface_grit = _prompt("surface_grit", default="")
    surface_finish = _prompt("surface_finish", default=surface_grit)
    release_date = _prompt("release_date (YYYY-MM-DD)", default="")
    status = _prompt("status", default="Active")

    return {
        "name": name,
        "brand": brand,
        "rg": rg,
        "diff": diff,
        "int_diff": int_diff,
        "symmetry": symmetry,
        "coverstock_type": coverstock_type,
        "surface_grit": surface_grit,
        "surface_finish": surface_finish,
        "release_date": release_date,
        "status": status,
    }


def append_rows(rows: list[dict]) -> None:
    """Append rows to the CSV, creating it with a header if needed."""
    write_header = not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)
    print(f"[manual_entry] Appended {len(rows)} row(s) to {CSV_PATH}")


def batch_from_json(path: str) -> None:
    """Load records from a JSON file and append to CSV."""
    with open(path, "r", encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        print("Error: JSON file must contain a top-level array.", file=sys.stderr)
        sys.exit(1)

    rows: list[dict] = []
    for index, rec in enumerate(records, start=1):
        if not isinstance(rec, dict):
            print(
                f"Error: record {index} must be a JSON object, got {type(rec).__name__}.",
                file=sys.stderr,
            )
            sys.exit(1)

        try:
            int_diff = float(rec.get("int_diff", 0))
            row = {
                "name": rec["name"],
                "brand": rec["brand"],
                "rg": float(rec["rg"]),
                "diff": float(rec["diff"]),
                "int_diff": int_diff,
                "symmetry": "Asymmetric" if int_diff > 0 else "Symmetric",
                "coverstock_type": rec.get("coverstock_type", ""),
                "surface_grit": rec.get("surface_grit", ""),
                "surface_finish": rec.get(
                    "surface_finish", rec.get("surface_grit", "")
                ),
                "release_date": rec.get("release_date", ""),
                "status": rec.get("status", "Active"),
            }
        except (KeyError, TypeError, ValueError) as exc:
            print(
                f"Error: invalid record {index} in {path}: {exc}.",
                file=sys.stderr,
            )
            sys.exit(1)
        rows.append(row)

    # Write once after full validation to avoid partial CSV writes.
    append_rows(rows)

    print(f"[manual_entry] Imported {len(rows)} records from {path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manually enter bowling ball records into data/balls.csv."
    )
    parser.add_argument(
        "--from-json", type=str, default=None,
        help="Path to a JSON file for batch import.",
    )
    args = parser.parse_args()

    if args.from_json:
        batch_from_json(args.from_json)
        return

    # Interactive loop
    print("Bowling ball manual entry tool")
    print("Type Ctrl-C to quit.\n")
    try:
        while True:
            row = interactive_entry()
            append_rows([row])
            print(f"  ✓ Saved: {row['brand']} {row['name']}")
    except (KeyboardInterrupt, EOFError):
        print("\nDone.")


if __name__ == "__main__":
    main()
