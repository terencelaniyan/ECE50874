"""Admin endpoint contract tests."""
import pytest



@pytest.mark.parametrize("path,payload", [
    ("/admin/refresh-catalog", None),
    ("/admin/train-model", {"n_arsenals": 50, "epochs": 1}),
])
def test_admin_endpoints_require_admin_key(client, path: str, payload):
    response = client.post(path, json=payload)
    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid or missing X-Admin-Key"
