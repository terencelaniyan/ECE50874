"""Tests for get_gaps — especially the custom-ID filtering fix."""
import pytest
from unittest.mock import MagicMock, patch, call
from app import services
from app.exceptions import ValidationError


def _make_conn():
    cur = MagicMock()
    cur.__enter__.return_value = cur
    cur.__exit__.return_value = None
    cur.fetchall.return_value = []
    cur.fetchone.return_value = None
    conn = MagicMock()
    conn.cursor.return_value = cur
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = None
    return conn, cur


# ── Custom ID filtering ───────────────────────────────────────────────────────

def test_get_gaps_does_not_validate_custom_prefixed_ids():
    """custom-<uuid> IDs from resolve_arsenal_rows must be stripped before validate_ball_ids."""
    conn, cur = _make_conn()

    with patch("app.services.resolve_arsenal_rows") as mock_resolve, \
         patch("app.services.validate_ball_ids") as mock_validate, \
         patch("app.services.compute_gaps", return_value=[]), \
         patch("app.services.group_gaps_by_zone", return_value=[]):

        # Simulate resolve returning a mix of catalog and custom IDs
        mock_resolve.return_value = ([], ["real-b1", "custom-some-uuid"])

        services.get_gaps(conn, None, ["real-b1"], None, k=5)

        mock_validate.assert_called_once()
        _, ids_arg = mock_validate.call_args[0]
        assert "real-b1" in ids_arg
        assert not any(bid.startswith("custom-") for bid in ids_arg)


def test_get_gaps_skips_validate_when_all_ids_are_custom():
    """validate_ball_ids is not called at all when every ID has the custom- prefix."""
    conn, cur = _make_conn()

    with patch("app.services.resolve_arsenal_rows") as mock_resolve, \
         patch("app.services.validate_ball_ids") as mock_validate, \
         patch("app.services.compute_gaps", return_value=[]), \
         patch("app.services.group_gaps_by_zone", return_value=[]):

        mock_resolve.return_value = ([], ["custom-aaa", "custom-bbb"])

        services.get_gaps(conn, None, [], None, k=5)

        mock_validate.assert_not_called()


def test_get_gaps_validates_real_ids_when_mixed():
    """Only catalog IDs are forwarded to validate_ball_ids, not custom ones."""
    conn, cur = _make_conn()

    with patch("app.services.resolve_arsenal_rows") as mock_resolve, \
         patch("app.services.validate_ball_ids") as mock_validate, \
         patch("app.services.compute_gaps", return_value=[]), \
         patch("app.services.group_gaps_by_zone", return_value=[]):

        mock_resolve.return_value = ([], ["B001", "B002", "custom-xyz"])

        services.get_gaps(conn, None, ["B001", "B002"], None, k=5)

        mock_validate.assert_called_once()
        _, ids_arg = mock_validate.call_args[0]
        assert set(ids_arg) == {"B001", "B002"}


def test_get_gaps_skips_validate_when_arsenal_id_provided():
    """Validation is not run when an arsenal_id (saved arsenal) is used."""
    conn, cur = _make_conn()

    with patch("app.services.resolve_arsenal_rows") as mock_resolve, \
         patch("app.services.validate_ball_ids") as mock_validate, \
         patch("app.services.compute_gaps", return_value=[]), \
         patch("app.services.group_gaps_by_zone", return_value=[]):

        mock_resolve.return_value = ([], ["B001", "B002"])

        # arsenal_id is set, so the validate branch is skipped
        services.get_gaps(conn, "some-arsenal-uuid", [], None, k=5)

        mock_validate.assert_not_called()


def test_get_gaps_returns_zones_with_labels():
    """get_gaps returns zone list with label and description populated."""
    conn, cur = _make_conn()

    fake_zone = {
        "center": [2.48, 0.055],
        "balls": [],
    }

    with patch("app.services.resolve_arsenal_rows") as mock_resolve, \
         patch("app.services.validate_ball_ids"), \
         patch("app.services.compute_gaps", return_value=[]), \
         patch("app.services.group_gaps_by_zone", return_value=[fake_zone]), \
         patch("app.services.label_zone", return_value="Low RG / High Differential"), \
         patch("app.services.zone_description", return_value="Strong hook"):

        mock_resolve.return_value = ([], [])

        zones = services.get_gaps(conn, None, [], None, k=5)

    assert len(zones) == 1
    assert zones[0]["label"] == "Low RG / High Differential"
    assert zones[0]["description"] == "Strong hook"
