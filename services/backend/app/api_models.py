# ===========================================================================
# backend/app/api_models.py
# ---------------------------------------------------------------------------
# Pydantic models for REST API request / response serialization.
#
# These models are shared across all endpoints (/balls, /arsenals,
# /recommendations, /gaps) and serve as both validation schemas and
# OpenAPI documentation sources.
# ===========================================================================

from datetime import date
from typing import Annotated, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Bowling Ball models
# ---------------------------------------------------------------------------

class Ball(BaseModel):
    """
    Represents a single bowling ball's specifications.
    
    Core specs (rg, diff, int_diff) drive the recommendation and gap
    analysis engines.  Extra fields from the database (e.g., added via
    ALTER TABLE) are tolerated thanks to `extra="allow"`.
    """
    model_config = ConfigDict(extra="allow")  # accept extra DB columns gracefully

    ball_id: str                              # unique identifier, e.g. "B001"
    name: str                                 # ball name, e.g. "Phaze V"
    brand: str                                # manufacturer, e.g. "Storm"

    rg: float                                 # radius of gyration (lower = earlier roll)
    diff: float                               # differential (higher = more flare potential)
    int_diff: float                           # intermediate differential (asymmetric cores only)

    symmetry: Optional[str] = None            # "Symmetric" or "Asymmetric"
    coverstock_type: Optional[str] = None     # e.g. "Solid Reactive", "Pearl Reactive"

    surface_grit: Optional[str] = None        # factory surface, e.g. "1500 Grit Polished"
    surface_finish: Optional[str] = None      # may duplicate surface_grit

    release_date: Optional[date] = None       # ISO date when ball was released
    status: Optional[str] = None              # "Active", "Retired", etc.


class BallsResponse(BaseModel):
    """Paginated response for GET /balls."""
    items: List[Ball]   # list of bowling balls on this page
    count: int          # total number of balls matching the filter


# ---------------------------------------------------------------------------
# Arsenal models – a user's personal collection of bowling balls
# ---------------------------------------------------------------------------

class ArsenalCatalogBallInput(BaseModel):
    """Catalog ball reference (must exist in balls table)."""
    custom: Literal[False] = False
    ball_id: str = Field(..., description="Must exist in the balls table")
    game_count: int = Field(default=0, ge=0, description="Games bowled (for degradation)")


class ArsenalCustomBallInput(BaseModel):
    """User-defined ball with specs (not in catalog)."""
    custom: Literal[True] = True
    name: Optional[str] = None
    brand: Optional[str] = None
    rg: float = Field(..., ge=2.0, le=3.0, description="Radius of gyration")
    diff: float = Field(..., ge=0.0, le=0.1, description="Differential")
    int_diff: float = Field(..., ge=0.0, le=0.1, description="Intermediate differential / mass bias")
    surface_grit: Optional[str] = None
    surface_finish: Optional[str] = None
    game_count: int = Field(default=0, ge=0)


ArsenalBallInput = Annotated[
    Union[ArsenalCatalogBallInput, ArsenalCustomBallInput],
    Field(discriminator="custom"),
]


class CreateArsenalRequest(BaseModel):
    """POST /arsenals – create a new arsenal."""
    name: Optional[str] = None
    balls: List[ArsenalBallInput] = Field(default_factory=list)


class UpdateArsenalRequest(BaseModel):
    """PATCH /arsenals/{id} – update arsenal name and/or ball list."""
    name: Optional[str] = None
    balls: Optional[List[ArsenalBallInput]] = None


class ArsenalBallResponse(BaseModel):
    """Single catalog ball entry in an arsenal response."""
    ball_id: str
    game_count: int


class ArsenalCustomBallResponse(BaseModel):
    """Single custom ball entry in an arsenal response."""
    id: str
    name: Optional[str] = None
    brand: Optional[str] = None
    rg: float
    diff: float
    int_diff: float
    surface_grit: Optional[str] = None
    surface_finish: Optional[str] = None
    game_count: int


class ArsenalResponse(BaseModel):
    """Full detail response for a single arsenal."""
    id: str
    name: Optional[str] = None
    balls: List[ArsenalBallResponse]
    custom_balls: List[ArsenalCustomBallResponse] = Field(default_factory=list)


class ArsenalSummary(BaseModel):
    """Lightweight summary for GET /arsenals listing."""
    id: str                                    # UUID string
    name: Optional[str] = None                 # display name
    ball_count: int                            # number of balls in the arsenal


# ---------------------------------------------------------------------------
# Recommendation models
# ---------------------------------------------------------------------------

class RecommendRequest(BaseModel):
    """POST /recommendations – request ball recommendations."""
    arsenal_ball_ids: List[str] = Field(default_factory=list)  # ad-hoc ball IDs
    arsenal_id: Optional[str] = None                           # or reference a saved arsenal
    game_counts: Optional[Dict[str, int]] = None               # ball_id -> game count for degradation
    k: int = Field(default=5, ge=1, le=50)                     # number of results to return
    w_rg: float = Field(default=1.0, ge=0.1, le=10.0)          # weight for RG in similarity
    w_diff: float = Field(default=1.0, ge=0.1, le=10.0)        # weight for differential
    w_int: float = Field(default=1.0, ge=0.1, le=10.0)         # weight for intermediate differential
    brand: Optional[str] = None                                 # filter candidates by brand (substring)
    coverstock_type: Optional[str] = None                       # filter candidates by coverstock (substring)
    status: Optional[str] = None                                # filter candidates by status (exact)
    diversity_min_distance: float = Field(default=0.0, ge=0.0, le=1.0)  # min spec distance between picks (0=off)


class RecommendationItem(BaseModel):
    """Single recommendation result."""
    ball: Ball       # the recommended ball
    score: float     # distance score (lower = more similar to arsenal)


class RecommendResponse(BaseModel):
    """Response for POST /recommendations."""
    items: List[RecommendationItem]  # top-k recommendations sorted by score ascending


# ---------------------------------------------------------------------------
# Gap Analysis models
# ---------------------------------------------------------------------------

class GapRequest(BaseModel):
    """POST /gaps – identify coverage gaps in user's arsenal."""
    arsenal_ball_ids: List[str] = Field(default_factory=list)  # ad-hoc ball IDs
    arsenal_id: Optional[str] = None                           # or reference a saved arsenal
    game_counts: Optional[Dict[str, int]] = None               # ball_id -> game count for degradation
    k: int = Field(default=10, ge=1, le=50)                    # number of results
    zone_threshold: float = 0.05                                # (rg, diff) distance to group into same zone


class GapItem(BaseModel):
    """Single gap analysis result."""
    ball: Ball           # the ball that fills this gap
    gap_score: float     # Voronoi distance score (higher = bigger coverage hole)


class GapZone(BaseModel):
    """One zone of clustered gap balls in (rg, diff) space."""
    center: List[float]   # [rg, diff], length 2
    label: str            # e.g. "Mid RG / High Differential"
    description: str      # short bowling description
    balls: List[GapItem]  # balls in this zone


class GapResponse(BaseModel):
    """Response for POST /gaps."""
    zones: List[GapZone]  # zones sorted by first ball's gap_score descending
