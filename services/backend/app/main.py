# backend/app/main.py
"""
Routers/Controllers: HTTP only. Validate input, call service layer, return response.
Business logic and database access live in services.py.
"""
import hmac
import os
import logging
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api_models import (
    ArsenalBallResponse,
    ArsenalCustomBallResponse,
    ArsenalResponse,
    ArsenalSummary,
    Ball,
    BallsResponse,
    CreateArsenalRequest,
    DegradationCompareRequest,
    DegradationCompareResponse,
    GapRequest,
    GapResponse,
    OilPatternsResponse,
    RecommendRequest,
    RecommendResponse,
    RecommendV2Request,
    RecommendV2Response,
    SlotAssignRequest,
    SlotAssignResponse,
    TrainModelRequest,
    UpdateArsenalRequest,
)
from .config import ALLOWED_ORIGIN, APP_ENV
from .db import get_db
from .exceptions import NotFoundError, ValidationError
from .services import (
    check_health,
    create_arsenal as svc_create_arsenal,
    delete_arsenal as svc_delete_arsenal,
    get_arsenal as svc_get_arsenal,
    get_ball as svc_get_ball,
    get_degradation_comparison as svc_get_degradation_comparison,
    get_gaps as svc_get_gaps,
    get_recommendations as svc_get_recommendations,
    get_recommendations_v2 as svc_get_recommendations_v2,
    get_slot_assignments as svc_get_slot_assignments,
    list_arsenals as svc_list_arsenals,
    list_balls as svc_list_balls,
    list_oil_patterns as svc_list_oil_patterns,
    train_two_tower as svc_train_two_tower,
    update_arsenal as svc_update_arsenal,
)

app = FastAPI(title="Bowling Ball Backend", version="2.0.0")
logger = logging.getLogger(__name__)

_DEV_ORIGINS = [
    "http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:5175",
    "http://127.0.0.1:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175",
]
CORS_ORIGINS = _DEV_ORIGINS if APP_ENV == "development" else [ALLOWED_ORIGIN]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

_resolved = Path(__file__).resolve()
# In Docker we have .../app/main.py (depth 2 under /app); locally .../services/backend/app/main.py (depth 4 under repo).
REPO_ROOT = _resolved.parents[3] if len(_resolved.parents) > 3 else _resolved.parents[1]


@app.exception_handler(NotFoundError)
def not_found_exception_handler(_, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": exc.message})


@app.exception_handler(ValidationError)
def validation_exception_handler(_, exc: ValidationError):
    return JSONResponse(
        status_code=400,
        content={"detail": {"message": exc.message, **exc.detail}},
    )


@app.get("/health")
def health(db=Depends(get_db)):
    """
    Check the health of the application and database connectivity.
    
    Returns:
        dict: A status dictionary containing "status" and "db" connectivity flag.
    """
    return check_health(db)


@app.get("/balls", response_model=BallsResponse)
def list_balls(
    db=Depends(get_db),
    brand: Optional[str] = None,
    coverstock_type: Optional[str] = None,
    symmetry: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = Query(
        default=None, description="Case-insensitive substring match on name"
    ),
    sort: str = Query(
        default="release_date",
        description="Sort by: name, brand, release_date, rg, diff, etc.",
    ),
    order: str = Query(
        default="desc", description="Sort direction: asc or desc"
    ),
    limit: int = Query(default=50, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    """
    List bowling balls with optional filtering, searching, and pagination.
    
    Args:
        db: Database session.
        brand: Filter by brand name.
        coverstock_type: Filter by coverstock type.
        symmetry: Filter by symmetry (e.g., Symmetric, Asymmetric).
        status: Filter by status (e.g., Active, Retired).
        q: Search query for name, brand, or coverstock.
        sort: Field to sort by.
        order: Sort direction (asc or desc).
        limit: Maximum number of items to return.
        offset: Number of items to skip.
        
    Returns:
        BallsResponse: A paginated list of balls and the total count.
    """
    rows, count = svc_list_balls(
        db,
        brand=brand,
        coverstock_type=coverstock_type,
        symmetry=symmetry,
        status=status,
        q=q,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )
    return {"items": rows, "count": count}


@app.get("/balls/{ball_id}", response_model=Ball)
def get_ball(ball_id: str, db=Depends(get_db)):
    """
    Retrieve details for a specific bowling ball by its ID.
    
    Args:
        ball_id: The unique identifier of the ball.
        db: Database session.
        
    Returns:
        Ball: The bowling ball details.
        
    Raises:
        HTTPException: 404 if the ball is not found.
    """
    row = svc_get_ball(db, ball_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Ball not found: {ball_id}")
    return row


def _split_arsenal_balls(balls):
    """Split validated ball list into catalog entries and custom ball dicts for the service layer."""
    catalog = []
    custom = []
    for b in balls:
        if getattr(b, "custom", False) is True:
            custom.append({
                "name": b.name,
                "brand": b.brand,
                "rg": b.rg,
                "diff": b.diff,
                "int_diff": b.int_diff,
                "surface_grit": b.surface_grit,
                "surface_finish": b.surface_finish,
                "game_count": b.game_count,
            })
        else:
            catalog.append({"ball_id": b.ball_id, "game_count": b.game_count})
    return catalog, custom


@app.post("/arsenals", response_model=ArsenalResponse, status_code=201)
def create_arsenal(req: CreateArsenalRequest, db=Depends(get_db)):
    """
    Create a new bowling ball arsenal.
    """
    catalog_balls, custom_balls = _split_arsenal_balls(req.balls)
    data = svc_create_arsenal(db, req.name, catalog_balls, custom_balls=custom_balls)
    return ArsenalResponse(
        id=data["id"],
        name=data["name"],
        balls=[ArsenalBallResponse(ball_id=b["ball_id"], game_count=b["game_count"]) for b in data["balls"]],
        custom_balls=[
            ArsenalCustomBallResponse(
                id=cb["id"],
                name=cb.get("name"),
                brand=cb.get("brand"),
                rg=cb["rg"],
                diff=cb["diff"],
                int_diff=cb["int_diff"],
                surface_grit=cb.get("surface_grit"),
                surface_finish=cb.get("surface_finish"),
                game_count=cb["game_count"],
            )
            for cb in data["custom_balls"]
        ],
    )


@app.get("/arsenals", response_model=List[ArsenalSummary])
def list_arsenals(
    db=Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """
    List all bowling ball arsenals with pagination.
    
    Args:
        db: Database session.
        limit: Maximum number of arsenals to return.
        offset: Number of arsenals to skip.
        
    Returns:
        List[ArsenalSummary]: A list of arsenal summaries including ball counts.
    """
    rows = svc_list_arsenals(db, limit=limit, offset=offset)
    return [ArsenalSummary(id=r["id"], name=r["name"], ball_count=r["ball_count"]) for r in rows]


@app.get("/arsenals/{arsenal_id}", response_model=ArsenalResponse)
def get_arsenal(arsenal_id: str, db=Depends(get_db)):
    """
    Retrieve details for a specific arsenal by its UUID.
    
    Args:
        arsenal_id: The UUID of the arsenal.
        db: Database session.
        
    Returns:
        ArsenalResponse: The arsenal details including its balls.
        
    Raises:
        HTTPException: 404 if the arsenal is not found.
    """
    data = svc_get_arsenal(db, arsenal_id)
    return ArsenalResponse(
        id=data["id"],
        name=data["name"],
        balls=[ArsenalBallResponse(ball_id=b["ball_id"], game_count=b["game_count"]) for b in data["balls"]],
        custom_balls=[
            ArsenalCustomBallResponse(
                id=cb["id"],
                name=cb.get("name"),
                brand=cb.get("brand"),
                rg=cb["rg"],
                diff=cb["diff"],
                int_diff=cb["int_diff"],
                surface_grit=cb.get("surface_grit"),
                surface_finish=cb.get("surface_finish"),
                game_count=cb["game_count"],
            )
            for cb in data["custom_balls"]
        ],
    )


@app.patch("/arsenals/{arsenal_id}", response_model=ArsenalResponse)
def update_arsenal(arsenal_id: str, req: UpdateArsenalRequest, db=Depends(get_db)):
    """
    Update an existing arsenal's name or ball list.
    
    Args:
        arsenal_id: The UUID of the arsenal to update.
        req: Request body with new name and/or ball list.
        db: Database session.
        
    Returns:
        ArsenalResponse: The updated arsenal details.
        
    Raises:
        HTTPException: 404 if not found, 400 if validation fails.
    """
    catalog_balls = None
    custom_balls = None
    if req.balls is not None:
        catalog_balls, custom_balls = _split_arsenal_balls(req.balls)
    svc_update_arsenal(db, arsenal_id, name=req.name, balls=catalog_balls, custom_balls=custom_balls)
    return get_arsenal(arsenal_id, db)


@app.delete("/arsenals/{arsenal_id}", status_code=204)
def delete_arsenal(arsenal_id: str, db=Depends(get_db)):
    """
    Delete an arsenal by its UUID.
    
    Args:
        arsenal_id: The UUID of the arsenal to delete.
        db: Database session.
        
    Raises:
        HTTPException: 404 if the arsenal is not found.
    """
    svc_delete_arsenal(db, arsenal_id)


@app.post("/recommendations", response_model=RecommendResponse)
def recommendations(req: RecommendRequest, db=Depends(get_db)):
    """
    Get bowling ball recommendations based on a user's current arsenal.
    
    The engine looks for balls that complement the existing arsenal's specs
    (RG, differential, etc.) while considering performance degradation.
    
    Args:
        req: Recommendation parameters including arsenal info and weights.
        db: Database session.
        
    Returns:
        RecommendResponse: A list of recommended balls with similarity scores.
        
    Raises:
        HTTPException: 400 if input parameters are invalid.
    """
    if req.arsenal_id and req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide either arsenal_id or arsenal_ball_ids, not both",
        )
    if not req.arsenal_id and not req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide arsenal_id or at least one arsenal_ball_id",
        )
    top = svc_get_recommendations(
        db,
        arsenal_id=req.arsenal_id,
        arsenal_ball_ids=req.arsenal_ball_ids,
        game_counts=req.game_counts,
        k=req.k,
        w_rg=req.w_rg,
        w_diff=req.w_diff,
        w_int=req.w_int,
        brand=req.brand,
        coverstock_type=req.coverstock_type,
        status=req.status,
        diversity_min_distance=req.diversity_min_distance,
    )
    return {"items": [{"ball": ball, "score": score} for (ball, score) in top]}


@app.post("/gaps", response_model=GapResponse)
def gaps(req: GapRequest, db=Depends(get_db)):
    """
    Perform gap analysis on a user's arsenal to identify missing ball types.
    
    Divides the (RG, differential) space into zones and identifies which
    zones are underserved by the current collection.
    
    Args:
        req: Gap analysis parameters.
        db: Database session.
        
    Returns:
        GapResponse: Clustered zones representing coverage gaps.
        
    Raises:
        HTTPException: 400 if input parameters are invalid.
    """
    if req.arsenal_id and req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide either arsenal_id or arsenal_ball_ids, not both",
        )
    zones = svc_get_gaps(
        db,
        arsenal_id=req.arsenal_id,
        arsenal_ball_ids=req.arsenal_ball_ids,
        game_counts=req.game_counts,
        k=req.k,
        zone_threshold=req.zone_threshold,
    )
    return GapResponse.model_validate({"zones": zones})


# ── Recommendations (v2 — Two-Tower + Enhanced KNN) ─────────────────────

@app.post("/recommendations/v2", response_model=RecommendV2Response)
def recommendations_v2(req: RecommendV2Request, db=Depends(get_db)):
    """V2 recommendations with model selection (KNN, two-tower, or hybrid)."""
    if req.arsenal_id and req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide either arsenal_id or arsenal_ball_ids, not both",
        )
    if not req.arsenal_id and not req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide arsenal_id or at least one arsenal_ball_id",
        )
    result = svc_get_recommendations_v2(
        db,
        arsenal_id=req.arsenal_id,
        arsenal_ball_ids=req.arsenal_ball_ids,
        game_counts=req.game_counts,
        k=req.k,
        w_rg=req.w_rg,
        w_diff=req.w_diff,
        w_int=req.w_int,
        w_cover=req.w_cover,
        method=req.method,
        metric=req.metric,
        normalize=req.normalize,
        degradation_model=req.degradation_model,
        brand=req.brand,
        coverstock_type=req.coverstock_type,
        status=req.status,
        diversity_min_distance=req.diversity_min_distance,
    )
    return result


# ── Slot Assignment ──────────────────────────────────────────────────────

@app.post("/slots", response_model=SlotAssignResponse)
def slot_assignment(req: SlotAssignRequest, db=Depends(get_db)):
    """Assign arsenal balls to the 6-ball slot system using K-Means + silhouette."""
    if req.arsenal_id and req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide either arsenal_id or arsenal_ball_ids, not both",
        )
    if not req.arsenal_id and not req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide arsenal_id or at least one arsenal_ball_id",
        )
    result = svc_get_slot_assignments(
        db,
        arsenal_id=req.arsenal_id,
        arsenal_ball_ids=req.arsenal_ball_ids,
        game_counts=req.game_counts,
    )
    return result


# ── Degradation Comparison ───────────────────────────────────────────────

@app.post("/degradation/compare", response_model=DegradationCompareResponse)
def degradation_compare(req: DegradationCompareRequest, db=Depends(get_db)):
    """Compare v1 (linear) vs v2 (logarithmic) degradation models."""
    ball_row = {
        "rg": req.rg,
        "diff": req.diff,
        "int_diff": req.int_diff,
        "coverstock_type": req.coverstock_type,
    }
    if req.ball_id:
        row = svc_get_ball(db, req.ball_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"Ball not found: {req.ball_id}")
        ball_row = dict(row)

    result = svc_get_degradation_comparison(ball_row, req.game_count)

    return DegradationCompareResponse.model_validate({
        "original": {
            "rg": result["original"]["rg"],
            "diff": result["original"]["diff"],
            "int_diff": result["original"]["int_diff"],
            "factor": 1.0,
        },
        "v1_linear": {
            "rg": result["v1_linear"]["rg"],
            "diff": result["v1_linear"]["diff"],
            "int_diff": result["v1_linear"]["int_diff"],
            "factor": result["v1_linear"]["factor"],
        },
        "v2_logarithmic": {
            "rg": result["v2_logarithmic"]["rg"],
            "diff": result["v2_logarithmic"]["diff"],
            "int_diff": result["v2_logarithmic"]["int_diff"],
            "factor": result["v2_logarithmic"]["factor"],
        },
        "game_count": result["game_count"],
        "coverstock_type": result["v2_logarithmic"].get("coverstock_type"),
        "v2_lambda": result["v2_logarithmic"]["lambda"],
    })


# ── Oil Patterns ─────────────────────────────────────────────────────────

@app.get("/oil-patterns", response_model=OilPatternsResponse)
def oil_patterns(db=Depends(get_db)):
    """List available oil patterns with friction zone data."""
    try:
        items = svc_list_oil_patterns(db)
    except Exception:
        logger.exception("Failed to list oil patterns from database; using fallback defaults")
        # Table might not exist yet — return hardcoded defaults
        items = [
            {"id": 1, "name": "House Shot (38ft)", "length_ft": 38,
             "description": "Standard recreational pattern",
             "zones": [{"startFt": 0, "endFt": 38, "mu": 0.04}, {"startFt": 38, "endFt": 60, "mu": 0.20}]},
            {"id": 2, "name": "Sport Shot — Badger (52ft)", "length_ft": 52,
             "description": "PBA animal pattern. Long oil",
             "zones": [{"startFt": 0, "endFt": 52, "mu": 0.04}, {"startFt": 52, "endFt": 60, "mu": 0.22}]},
            {"id": 3, "name": "Sport Shot — Cheetah (33ft)", "length_ft": 33,
             "description": "PBA animal pattern. Short oil",
             "zones": [{"startFt": 0, "endFt": 33, "mu": 0.04}, {"startFt": 33, "endFt": 60, "mu": 0.18}]},
            {"id": 4, "name": "Sport Shot — Chameleon (41ft)", "length_ft": 41,
             "description": "PBA animal pattern. Medium length",
             "zones": [{"startFt": 0, "endFt": 41, "mu": 0.04}, {"startFt": 41, "endFt": 60, "mu": 0.20}]},
        ]
    return {"items": items}


# ── Admin ────────────────────────────────────────────────────────────────

ADMIN_KEY = os.environ.get("ADMIN_KEY")


def _require_admin_key(x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")) -> None:
    if not ADMIN_KEY or not hmac.compare_digest(x_admin_key or "", ADMIN_KEY):
        raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Key")


@app.post("/admin/refresh-catalog")
def refresh_catalog(_: None = Depends(_require_admin_key)):
    """
    Runs scrape_btm.py then seed_from_csv.py to refresh the ball catalog.
    Long-running (up to 10 min). Requires X-Admin-Key header when ADMIN_KEY is set.
    """
    try:
        subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "scrape_btm.py")],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.CalledProcessError as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "step": "scrape",
                "detail": e.stderr or "",
            },
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "step": "scrape",
                "detail": "Scrape timed out after 600s",
            },
        )

    try:
        seed = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "services" / "backend" / "scripts" / "seed_from_csv.py"),
            ],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "step": "seed",
                "detail": e.stderr or "",
            },
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "step": "seed",
                "detail": "Seed timed out after 120s",
            },
        )

    return {"status": "ok", "message": "Catalog refreshed", "seed_output": seed.stdout}


@app.post("/admin/train-model")
def train_model(req: TrainModelRequest, db=Depends(get_db), _: None = Depends(_require_admin_key)):
    """Train the two-tower recommendation model on synthetic arsenal data."""
    result = svc_train_two_tower(
        db,
        n_arsenals=req.n_arsenals,
        epochs=req.epochs,
        batch_size=req.batch_size,
        lr=req.lr,
        neg_ratio=req.neg_ratio,
    )
    if "error" in result:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": result["error"]},
        )
    return {"status": "ok", **result}
