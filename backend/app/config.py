# backend/app/config.py
import os
from dotenv import load_dotenv

# Load .env from repo root (works when you run from repo root)
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create a .env file at repo root with DATABASE_URL=postgresql://..."
    )
