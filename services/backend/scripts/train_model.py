"""
Train the two-tower recommendation model after database seeding.
Reads balls from DATABASE_URL, generates synthetic arsenals, trains PyTorch model.
Saves model checkpoint to models/two_tower.pt.

Run from repo root:
    DATABASE_URL=... python services/backend/scripts/train_model.py
"""
from __future__ import annotations

import os
import sys
import time

# Add backend source to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db import get_conn
from app.services import train_two_tower


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set — skipping model training.")
        return

    print("Training two-tower recommendation model...")
    print("  Parameters: n_arsenals=5000, epochs=15, batch_size=256")
    start = time.time()

    with get_conn() as conn:
        result = train_two_tower(
            conn,
            n_arsenals=5000,
            epochs=15,
            batch_size=256,
            lr=0.001,
            neg_ratio=4,
        )

    elapsed = time.time() - start
    print(f"  Training complete in {elapsed:.1f}s")
    print(f"  Model saved to: {result.get('model_path', 'models/two_tower.pt')}")
    print(f"  Training samples: {result.get('n_samples', '?')}")


if __name__ == "__main__":
    main()
