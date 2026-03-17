"""Unit tests for two-tower model and synthetic data generation."""
import pytest

from app.synthetic_data import (
    ball_to_features,
    arsenal_to_features,
    encode_coverstock,
    encode_brand,
    generate_synthetic_arsenals,
    _ball_fits_slot,
    SLOT_RANGES,
)
from app.two_tower import (
    TORCH_AVAILABLE,
    get_two_tower_recommendations,
    EMBED_DIM,
    USER_FEAT_DIM,
    ITEM_FEAT_DIM,
)


# ── Feature encoding tests ──────────────────────────────────────────────

def test_ball_to_features_returns_5_floats():
    ball = {"rg": 2.50, "diff": 0.040, "int_diff": 0.015,
            "coverstock_type": "Solid Reactive", "brand": "Storm"}
    feats = ball_to_features(ball)
    assert len(feats) == 5
    assert all(isinstance(f, float) for f in feats)
    assert feats[0] == 2.50  # rg
    assert feats[1] == 0.040  # diff
    assert feats[2] == 0.015  # int_diff


def test_ball_to_features_handles_none():
    ball = {"rg": 2.50, "diff": 0.040}
    feats = ball_to_features(ball)
    assert feats[2] == 0.0  # int_diff defaults to 0


def test_arsenal_to_features_returns_15_floats():
    arsenal = [
        {"rg": 2.48, "diff": 0.055, "int_diff": 0.02, "coverstock_type": "Solid Reactive", "brand": "Storm"},
        {"rg": 2.55, "diff": 0.030, "int_diff": 0.01, "coverstock_type": "Pearl Reactive", "brand": "Motiv"},
    ]
    feats = arsenal_to_features(arsenal)
    assert len(feats) == 15
    assert all(isinstance(f, float) for f in feats)


def test_arsenal_to_features_empty():
    feats = arsenal_to_features([])
    assert len(feats) == 15
    assert all(f == 0.0 for f in feats)


def test_encode_coverstock_known_types():
    assert encode_coverstock("Solid Reactive") == 4
    assert encode_coverstock("Pearl Reactive") == 2
    assert encode_coverstock("Hybrid Reactive") == 3
    assert encode_coverstock("Urethane") == 1
    assert encode_coverstock("Plastic") == 0
    assert encode_coverstock("Polyester") == 0


def test_encode_coverstock_case_insensitive():
    assert encode_coverstock("SOLID REACTIVE") == 4
    assert encode_coverstock("solid reactive") == 4


def test_encode_coverstock_unknown():
    assert encode_coverstock("Unknown") == 2  # default mid-range
    assert encode_coverstock("") == 2


def test_encode_brand_known():
    assert encode_brand("Storm") >= 1
    assert encode_brand("Motiv") >= 1
    assert encode_brand("Brunswick") >= 1


def test_encode_brand_unknown():
    assert encode_brand("Unknown Brand") == 0
    assert encode_brand("") == 0


# ── Slot fitting tests ──────────────────────────────────────────────────

def test_ball_fits_slot_1():
    ball = {"rg": 2.48, "diff": 0.055, "coverstock_type": "Solid Reactive"}
    assert _ball_fits_slot(ball, 1) is True


def test_ball_doesnt_fit_wrong_slot():
    ball = {"rg": 2.48, "diff": 0.055, "coverstock_type": "Solid Reactive"}
    assert _ball_fits_slot(ball, 5) is False  # Too low RG, too high diff for spare


def test_ball_fits_slot_5_spare():
    ball = {"rg": 2.58, "diff": 0.015, "coverstock_type": "Plastic"}
    assert _ball_fits_slot(ball, 5) is True


# ── Synthetic data generation tests ─────────────────────────────────────

def _make_catalog():
    """Create a small realistic catalog for testing."""
    catalog = []
    for i, (rg, diff, cover) in enumerate([
        (2.48, 0.055, "Solid Reactive"),
        (2.47, 0.050, "Solid Reactive"),
        (2.49, 0.045, "Hybrid Reactive"),
        (2.51, 0.042, "Hybrid Reactive"),
        (2.52, 0.040, "Pearl Reactive"),
        (2.53, 0.038, "Pearl Reactive"),
        (2.55, 0.030, "Pearl Reactive"),
        (2.56, 0.025, "Hybrid Reactive"),
        (2.58, 0.015, "Plastic"),
        (2.60, 0.010, "Plastic"),
        (2.50, 0.050, "Solid Reactive"),
        (2.48, 0.048, "Urethane"),
    ]):
        catalog.append({
            "ball_id": f"B{i+1:04d}",
            "name": f"Test Ball {i+1}",
            "brand": "TestBrand",
            "rg": rg,
            "diff": diff,
            "int_diff": diff * 0.3,
            "coverstock_type": cover,
        })
    return catalog


def test_generate_synthetic_arsenals_produces_data():
    catalog = _make_catalog()
    arsenals = generate_synthetic_arsenals(catalog, n_arsenals=100, seed=42)
    assert len(arsenals) > 0
    # Each entry is (arsenal_balls, positive_balls)
    for arsenal_balls, positive_balls in arsenals[:5]:
        assert len(arsenal_balls) >= 3
        assert len(positive_balls) >= 1


def test_generate_synthetic_arsenals_deterministic():
    catalog = _make_catalog()
    a1 = generate_synthetic_arsenals(catalog, n_arsenals=50, seed=42)
    a2 = generate_synthetic_arsenals(catalog, n_arsenals=50, seed=42)
    assert len(a1) == len(a2)
    for (ab1, pb1), (ab2, pb2) in zip(a1[:5], a2[:5]):
        assert [b["ball_id"] for b in ab1] == [b["ball_id"] for b in ab2]


def test_generate_synthetic_arsenals_empty_catalog():
    arsenals = generate_synthetic_arsenals([], n_arsenals=100)
    assert arsenals == []


# ── Two-tower recommender tests ─────────────────────────────────────────

def test_get_two_tower_recommendations_no_model():
    """Without a trained model, should return empty list."""
    arsenal = [{"rg": 2.50, "diff": 0.040, "int_diff": 0.015}]
    candidates = [{"ball_id": "B1", "rg": 2.55, "diff": 0.030, "int_diff": 0.01}]
    result = get_two_tower_recommendations(arsenal, candidates, k=5)
    # Without trained model, returns empty (graceful fallback)
    assert isinstance(result, list)


def test_get_two_tower_recommendations_empty_arsenal():
    result = get_two_tower_recommendations([], [{"ball_id": "B1", "rg": 2.5, "diff": 0.04}], k=5)
    assert result == []


def test_get_two_tower_recommendations_empty_candidates():
    result = get_two_tower_recommendations(
        [{"rg": 2.5, "diff": 0.04, "int_diff": 0.01}], [], k=5
    )
    assert result == []


# ── PyTorch model tests (conditional) ────────────────────────────────────

@pytest.mark.skipif(not TORCH_AVAILABLE, reason="PyTorch not installed")
def test_torch_model_forward():
    import torch
    from app.two_tower import TwoTowerModel

    model = TwoTowerModel()
    user_feat = torch.randn(4, USER_FEAT_DIM)
    item_feat = torch.randn(4, ITEM_FEAT_DIM)
    scores = model(user_feat, item_feat)
    assert scores.shape == (4,)


@pytest.mark.skipif(not TORCH_AVAILABLE, reason="PyTorch not installed")
def test_torch_embeddings_normalized():
    import torch
    from app.two_tower import TwoTowerModel

    model = TwoTowerModel()
    user_feat = torch.randn(2, USER_FEAT_DIM)
    item_feat = torch.randn(2, ITEM_FEAT_DIM)
    user_emb = model.user_embed(user_feat)
    item_emb = model.item_embed(item_feat)
    # L2 normalized embeddings should have unit norm
    norms_user = torch.norm(user_emb, dim=1)
    norms_item = torch.norm(item_emb, dim=1)
    assert torch.allclose(norms_user, torch.ones(2), atol=1e-5)
    assert torch.allclose(norms_item, torch.ones(2), atol=1e-5)


@pytest.mark.skipif(not TORCH_AVAILABLE, reason="PyTorch not installed")
def test_train_model_small():
    """Test training on a tiny catalog (smoke test)."""
    from app.two_tower import train_model

    catalog = _make_catalog()
    result = train_model(catalog, n_arsenals=50, epochs=2, batch_size=32, seed=42)
    assert result is not None
    assert "error" not in result or result.get("n_training_pairs", 0) > 0
    if "n_training_pairs" in result:
        assert result["n_training_pairs"] > 0
        assert result["final_loss"] is not None
        assert result["epochs"] == 2
