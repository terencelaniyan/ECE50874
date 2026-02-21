# backend/app/api_models.py
from datetime import date
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Ball(BaseModel):
    ball_id: str
    name: str
    brand: str

    rg: float
    diff: float
    int_diff: float

    symmetry: Optional[str] = None
    coverstock_type: Optional[str] = None

    surface_grit: Optional[str] = None
    surface_finish: Optional[str] = None

    release_date: Optional[date] = None
    status: Optional[str] = None


class BallsResponse(BaseModel):
    items: List[Ball]
    count: int


class ArsenalBallInput(BaseModel):
    ball_id: str
    game_count: int = Field(default=0, ge=0)


class CreateArsenalRequest(BaseModel):
    name: Optional[str] = None
    balls: List[ArsenalBallInput] = Field(default_factory=list)


class UpdateArsenalRequest(BaseModel):
    name: Optional[str] = None
    balls: Optional[List[ArsenalBallInput]] = None


class ArsenalBallResponse(BaseModel):
    ball_id: str
    game_count: int


class ArsenalResponse(BaseModel):
    id: str
    name: Optional[str] = None
    balls: List[ArsenalBallResponse]


class ArsenalSummary(BaseModel):
    id: str
    name: Optional[str] = None
    ball_count: int


class RecommendRequest(BaseModel):
    arsenal_ball_ids: List[str] = Field(default_factory=list)
    arsenal_id: Optional[str] = None
    game_counts: Optional[Dict[str, int]] = None
    k: int = Field(default=5, ge=1, le=50)


class RecommendationItem(BaseModel):
    ball: Ball
    score: float


class RecommendResponse(BaseModel):
    items: List[RecommendationItem]


class GapRequest(BaseModel):
    arsenal_ball_ids: List[str] = Field(default_factory=list)
    arsenal_id: Optional[str] = None
    game_counts: Optional[Dict[str, int]] = None
    k: int = Field(default=10, ge=1, le=50)


class GapItem(BaseModel):
    ball: Ball
    gap_score: float


class GapResponse(BaseModel):
    items: List[GapItem]
