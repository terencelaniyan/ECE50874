import os

import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests that require DATABASE_URL and a seeded balls table",
    )


def _needs_db():
    return not os.getenv("DATABASE_URL", "").strip()

