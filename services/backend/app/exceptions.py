# ===========================================================================
# backend/app/exceptions.py
# ---------------------------------------------------------------------------
# Domain exceptions raised by the service layer. Routers map these to
# HTTP responses (e.g. NotFoundError -> 404, ValidationError -> 400).
# ===========================================================================


class NotFoundError(Exception):
    """Resource does not exist (e.g. arsenal or ball not found)."""
    def __init__(self, message: str = "Not found"):
        self.message = message
        super().__init__(message)


class ValidationError(Exception):
    """Invalid input (e.g. missing ball_ids, conflicting params)."""
    def __init__(self, message: str, detail: dict | None = None):
        self.message = message
        self.detail = detail or {}
        super().__init__(message)
