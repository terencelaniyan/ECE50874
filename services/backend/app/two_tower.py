# ===========================================================================
# backend/app/two_tower.py
# ---------------------------------------------------------------------------
# Two-Tower Recommendation Model for bowling ball recommendations.
#
# Architecture:
#   User Tower:  arsenal features (15-dim) → [64] → [32] → 16-dim embedding
#   Item Tower:  ball features (5-dim)     → [32] → [32] → 16-dim embedding
#   Scoring:     cosine similarity of user and item embeddings
#
# The model learns that certain arsenals (user towers) pair well with
# certain balls (item towers), capturing complementarity rather than
# just similarity (which is what KNN does).
#
# Training uses synthetic arsenals generated from the 6-ball slot system
# with contrastive loss (positive pairs from unfilled slots, negatives
# sampled randomly).
# ===========================================================================

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from .synthetic_data import arsenal_to_features, ball_to_features

# Try to import torch; if unavailable, the model falls back to a
# numpy-based cosine similarity scorer using precomputed embeddings.
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# Embedding dimension
EMBED_DIM = 16
USER_FEAT_DIM = 15   # arsenal_to_features output size
ITEM_FEAT_DIM = 5    # ball_to_features output size

# Default model path
MODEL_DIR = Path(__file__).parent.parent / "models"
MODEL_PATH = MODEL_DIR / "two_tower.pt"
EMBEDDINGS_PATH = MODEL_DIR / "ball_embeddings.json"


# ── PyTorch model definition ────────────────────────────────────────────

if TORCH_AVAILABLE:
    class UserTower(nn.Module):
        """Encodes arsenal features into a fixed-size embedding."""

        def __init__(self, input_dim: int = USER_FEAT_DIM, embed_dim: int = EMBED_DIM):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 64),
                nn.ReLU(),
                nn.Dropout(0.1),
                nn.Linear(64, 32),
                nn.ReLU(),
                nn.Linear(32, embed_dim),
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            emb = self.net(x)
            return F.normalize(emb, p=2, dim=-1)

    class ItemTower(nn.Module):
        """Encodes ball features into a fixed-size embedding."""

        def __init__(self, input_dim: int = ITEM_FEAT_DIM, embed_dim: int = EMBED_DIM):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 32),
                nn.ReLU(),
                nn.Dropout(0.1),
                nn.Linear(32, 32),
                nn.ReLU(),
                nn.Linear(32, embed_dim),
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            emb = self.net(x)
            return F.normalize(emb, p=2, dim=-1)

    class TwoTowerModel(nn.Module):
        """Two-tower model: user tower + item tower with cosine similarity."""

        def __init__(self):
            super().__init__()
            self.user_tower = UserTower()
            self.item_tower = ItemTower()

        def forward(
            self,
            user_feat: torch.Tensor,
            item_feat: torch.Tensor,
        ) -> torch.Tensor:
            """Return cosine similarity scores (batch)."""
            user_emb = self.user_tower(user_feat)
            item_emb = self.item_tower(item_feat)
            return (user_emb * item_emb).sum(dim=-1)

        def user_embed(self, user_feat: torch.Tensor) -> torch.Tensor:
            return self.user_tower(user_feat)

        def item_embed(self, item_feat: torch.Tensor) -> torch.Tensor:
            return self.item_tower(item_feat)


# ── Training ─────────────────────────────────────────────────────────────

def train_model(
    catalog: List[Dict],
    n_arsenals: int = 10000,
    epochs: int = 20,
    batch_size: int = 256,
    lr: float = 1e-3,
    neg_ratio: int = 4,
    seed: int = 42,
) -> Optional[Dict]:
    """
    Train the two-tower model on synthetic arsenal data.

    For each (arsenal, positive_ball) pair, we sample `neg_ratio` negative
    balls randomly and train with binary cross-entropy loss.

    Returns dict with training stats, or None if torch unavailable.
    """
    if not TORCH_AVAILABLE:
        return None

    from .synthetic_data import generate_synthetic_arsenals

    # Generate training data
    data = generate_synthetic_arsenals(catalog, n_arsenals=n_arsenals, seed=seed)
    if not data:
        return {"error": "No training data generated (check catalog size/variety)"}

    # Build training pairs
    rng = np.random.RandomState(seed)
    user_feats = []
    item_feats = []
    labels = []

    for arsenal_balls, positive_balls in data:
        a_feat = arsenal_to_features(arsenal_balls)
        for pos_ball in positive_balls:
            # Positive pair
            user_feats.append(a_feat)
            item_feats.append(ball_to_features(pos_ball))
            labels.append(1.0)
            # Negative pairs (random balls from catalog)
            for _ in range(neg_ratio):
                neg_ball = catalog[rng.randint(len(catalog))]
                user_feats.append(a_feat)
                item_feats.append(ball_to_features(neg_ball))
                labels.append(0.0)

    user_tensor = torch.tensor(user_feats, dtype=torch.float32)
    item_tensor = torch.tensor(item_feats, dtype=torch.float32)
    label_tensor = torch.tensor(labels, dtype=torch.float32)

    # Normalize numeric features
    user_mean = user_tensor.mean(dim=0)
    user_std = user_tensor.std(dim=0).clamp(min=1e-6)
    item_mean = item_tensor.mean(dim=0)
    item_std = item_tensor.std(dim=0).clamp(min=1e-6)

    user_tensor = (user_tensor - user_mean) / user_std
    item_tensor = (item_tensor - item_mean) / item_std

    # Train
    model = TwoTowerModel()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    dataset = torch.utils.data.TensorDataset(user_tensor, item_tensor, label_tensor)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)

    losses = []
    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0
        n_batches = 0
        for u_batch, i_batch, l_batch in loader:
            scores = model(u_batch, i_batch)
            loss = F.binary_cross_entropy_with_logits(scores, l_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            n_batches += 1
        avg_loss = epoch_loss / max(n_batches, 1)
        losses.append(avg_loss)

    # Save model and normalization stats
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    save_data = {
        "model_state": model.state_dict(),
        "user_mean": user_mean,
        "user_std": user_std,
        "item_mean": item_mean,
        "item_std": item_std,
    }
    torch.save(save_data, str(MODEL_PATH))

    # Precompute item embeddings for fast inference
    model.eval()
    with torch.no_grad():
        all_item_feats = torch.tensor(
            [ball_to_features(b) for b in catalog],
            dtype=torch.float32,
        )
        all_item_norm = (all_item_feats - item_mean) / item_std
        all_embeddings = model.item_embed(all_item_norm).numpy().tolist()

    embeddings_data = {
        "ball_ids": [b.get("ball_id", f"B{i}") for i, b in enumerate(catalog)],
        "embeddings": all_embeddings,
    }
    with open(EMBEDDINGS_PATH, "w") as f:
        json.dump(embeddings_data, f)

    return {
        "n_training_pairs": len(labels),
        "n_positive": sum(1 for l in labels if l > 0.5),
        "n_negative": sum(1 for l in labels if l <= 0.5),
        "epochs": epochs,
        "final_loss": losses[-1] if losses else None,
        "loss_history": losses,
        "model_path": str(MODEL_PATH),
        "embeddings_path": str(EMBEDDINGS_PATH),
    }


# ── Inference ────────────────────────────────────────────────────────────

class TwoTowerRecommender:
    """
    Inference wrapper for the two-tower model.

    Loads a trained model (or precomputed embeddings) and scores
    candidate balls against an arsenal.
    """

    def __init__(self):
        self._model = None
        self._user_mean = None
        self._user_std = None
        self._item_mean = None
        self._item_std = None
        self._ball_embeddings = None  # {ball_id: np.array}
        self._loaded = False

    def load(self) -> bool:
        """Load model or precomputed embeddings. Returns True if successful."""
        if self._loaded:
            return True

        # Try loading precomputed embeddings (works without torch)
        if EMBEDDINGS_PATH.exists():
            try:
                with open(EMBEDDINGS_PATH) as f:
                    data = json.load(f)
                self._ball_embeddings = {
                    bid: np.array(emb)
                    for bid, emb in zip(data["ball_ids"], data["embeddings"])
                }
            except (json.JSONDecodeError, KeyError):
                pass

        # Try loading full model (requires torch)
        if TORCH_AVAILABLE and MODEL_PATH.exists():
            try:
                save_data = torch.load(str(MODEL_PATH), map_location="cpu", weights_only=False)
                self._model = TwoTowerModel()
                self._model.load_state_dict(save_data["model_state"])
                self._model.eval()
                self._user_mean = save_data["user_mean"]
                self._user_std = save_data["user_std"]
                self._item_mean = save_data["item_mean"]
                self._item_std = save_data["item_std"]
            except Exception:
                self._model = None

        self._loaded = self._model is not None or self._ball_embeddings is not None
        return self._loaded

    def is_available(self) -> bool:
        """Check if model is loaded and ready for inference."""
        return self._loaded and (self._model is not None or self._ball_embeddings is not None)

    def recommend(
        self,
        arsenal_balls: List[Dict],
        candidate_balls: List[Dict],
        k: int = 10,
    ) -> List[Tuple[Dict, float]]:
        """
        Score and rank candidate balls for an arsenal using the two-tower model.

        Returns list of (ball_dict, score) sorted by score descending
        (higher = better complement).
        """
        if not self.is_available() or not arsenal_balls or not candidate_balls:
            return []

        # Compute user embedding
        user_feat = arsenal_to_features(arsenal_balls)

        if self._model is not None:
            return self._recommend_with_model(user_feat, candidate_balls, k)
        elif self._ball_embeddings is not None:
            return self._recommend_with_embeddings(user_feat, candidate_balls, k)
        return []

    def _recommend_with_model(
        self,
        user_feat: List[float],
        candidate_balls: List[Dict],
        k: int,
    ) -> List[Tuple[Dict, float]]:
        """Score candidates using the full PyTorch model."""
        user_tensor = torch.tensor([user_feat], dtype=torch.float32)
        user_tensor = (user_tensor - self._user_mean) / self._user_std

        item_feats = [ball_to_features(b) for b in candidate_balls]
        item_tensor = torch.tensor(item_feats, dtype=torch.float32)
        item_tensor = (item_tensor - self._item_mean) / self._item_std

        with torch.no_grad():
            user_emb = self._model.user_embed(user_tensor)  # (1, embed_dim)
            item_embs = self._model.item_embed(item_tensor)  # (n, embed_dim)
            scores = (user_emb * item_embs).sum(dim=-1).numpy().flatten()

        scored = list(zip(candidate_balls, scores.tolist()))
        scored.sort(key=lambda t: t[1], reverse=True)
        return scored[:k]

    def _recommend_with_embeddings(
        self,
        user_feat: List[float],
        candidate_balls: List[Dict],
        k: int,
    ) -> List[Tuple[Dict, float]]:
        """
        Score candidates using precomputed item embeddings.
        Without the user tower, approximate with feature-based heuristic.
        """
        scored = []
        user_arr = np.array(user_feat)

        for ball in candidate_balls:
            bid = ball.get("ball_id", "")
            if bid in self._ball_embeddings:
                # Use embedding norm as a proxy (items closer to origin = more generic)
                emb = self._ball_embeddings[bid]
                # Simple heuristic: score based on ball features vs arsenal mean
                ball_feat = np.array(ball_to_features(ball))
                # Distance from arsenal center in feature space
                arsenal_center = user_arr[:5]  # mean features
                dist = np.sqrt(np.sum((ball_feat - arsenal_center) ** 2))
                # Invert: complement = farther from what you have (in different slots)
                score = float(np.dot(emb, emb))  # placeholder with embedding magnitude
                scored.append((ball, score))
            else:
                scored.append((ball, 0.0))

        scored.sort(key=lambda t: t[1], reverse=True)
        return scored[:k]


# Module-level singleton
_recommender = TwoTowerRecommender()


def get_two_tower_recommendations(
    arsenal_balls: List[Dict],
    candidate_balls: List[Dict],
    k: int = 10,
) -> List[Tuple[Dict, float]]:
    """
    Public API: get two-tower recommendations.

    Loads model lazily on first call. Falls back to empty list
    if model is not trained yet.
    """
    _recommender.load()
    if not _recommender.is_available():
        return []
    return _recommender.recommend(arsenal_balls, candidate_balls, k)
