# backend/app/main.py
"""
Routers/Controllers: HTTP only. Validate input, call service layer, return response.
Business logic and database access live in services.py.
"""
import os
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api_models import (
    ArsenalBallResponse,
    ArsenalResponse,
    ArsenalSummary,
    Ball,
    BallsResponse,
    CreateArsenalRequest,
    GapRequest,
    GapResponse,
    RecommendRequest,
    RecommendResponse,
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
    get_gaps as svc_get_gaps,
    get_recommendations as svc_get_recommendations,
    list_arsenals as svc_list_arsenals,
    list_balls as svc_list_balls,
    update_arsenal as svc_update_arsenal,
)

app = FastAPI(title="Bowling Ball Backend", version="1.0.0")

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

REPO_ROOT = Path(__file__).resolve().parents[3]


@app.get("/health")
def health(db=Depends(get_db)):
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
    row = svc_get_ball(db, ball_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Ball not found: {ball_id}")
    return row


@app.post("/arsenals", response_model=ArsenalResponse, status_code=201)
def create_arsenal(req: CreateArsenalRequest, db=Depends(get_db)):
    balls = [{"ball_id": b.ball_id, "game_count": b.game_count} for b in req.balls]
    try:
        data = svc_create_arsenal(db, req.name, balls)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, **e.detail},
        )
    return ArsenalResponse(
        id=data["id"],
        name=data["name"],
        balls=[ArsenalBallResponse(ball_id=b["ball_id"], game_count=b["game_count"]) for b in data["balls"]],
    )


@app.get("/arsenals", response_model=List[ArsenalSummary])
def list_arsenals(
    db=Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    rows = svc_list_arsenals(db, limit=limit, offset=offset)
    return [ArsenalSummary(id=r["id"], name=r["name"], ball_count=r["ball_count"]) for r in rows]


@app.get("/arsenals/{arsenal_id}", response_model=ArsenalResponse)
def get_arsenal(arsenal_id: str, db=Depends(get_db)):
    try:
        data = svc_get_arsenal(db, arsenal_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)
    return ArsenalResponse(
        id=data["id"],
        name=data["name"],
        balls=[ArsenalBallResponse(ball_id=b["ball_id"], game_count=b["game_count"]) for b in data["balls"]],
    )


@app.patch("/arsenals/{arsenal_id}", response_model=ArsenalResponse)
def update_arsenal(arsenal_id: str, req: UpdateArsenalRequest, db=Depends(get_db)):
    try:
        balls = None
        if req.balls is not None:
            balls = [{"ball_id": b.ball_id, "game_count": b.game_count} for b in req.balls]
        svc_update_arsenal(db, arsenal_id, name=req.name, balls=balls)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, **e.detail},
        )
    return get_arsenal(arsenal_id, db)


@app.delete("/arsenals/{arsenal_id}", status_code=204)
def delete_arsenal(arsenal_id: str, db=Depends(get_db)):
    try:
        svc_delete_arsenal(db, arsenal_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=e.message)


@app.post("/recommendations", response_model=RecommendResponse)
def recommendations(req: RecommendRequest, db=Depends(get_db)):
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
    try:
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
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, **e.detail},
        )
    return {"items": [{"ball": ball, "score": score} for (ball, score) in top]}


@app.post("/gaps", response_model=GapResponse)
def gaps(req: GapRequest, db=Depends(get_db)):
    if req.arsenal_id and req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide either arsenal_id or arsenal_ball_ids, not both",
        )
    try:
        zones = svc_get_gaps(
            db,
            arsenal_id=req.arsenal_id,
            arsenal_ball_ids=req.arsenal_ball_ids,
            game_counts=req.game_counts,
            k=req.k,
            zone_threshold=req.zone_threshold,
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, **e.detail},
        )
    return GapResponse(zones=zones)


ADMIN_KEY = os.environ.get("ADMIN_KEY")


def _require_admin_key(x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")) -> None:
    if ADMIN_KEY and x_admin_key != ADMIN_KEY:
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
