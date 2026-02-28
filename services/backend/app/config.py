# ===========================================================================
# backend/app/config.py
# ---------------------------------------------------------------------------
# Centralized configuration loader for the backend.
#
# Reads DATABASE_URL from environment variables or .env files.  The lookup
# order is:
#   1. Already-set environment variable (e.g. from docker-compose).
#   2. .env in the backend root  (services/backend/.env).
#   3. .env in the repository root.
#
# If DATABASE_URL cannot be resolved from any source, a RuntimeError is
# raised immediately at import time so the app fails fast.
# ===========================================================================

import os
from pathlib import Path

from dotenv import load_dotenv

# Attempt to load env vars from the nearest .env file (cwd or parents)
load_dotenv()

# Resolve directory paths for fallback .env lookups
_backend_root = Path(__file__).resolve().parent.parent          # services/backend/
_repo_root = _backend_root.parent.parent                        # project root

# Fallback: try backend-local .env if DATABASE_URL still unset
if not os.getenv("DATABASE_URL", "").strip():
    load_dotenv(_backend_root / ".env")

# Fallback: try repo-root .env as a last resort
if not os.getenv("DATABASE_URL", "").strip():
    load_dotenv(_repo_root / ".env")

# Final resolved connection string for PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Fail fast if no database connection string is available
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create a .env file at repo root or in "
        "services/backend with DATABASE_URL=postgresql://..."
    )
