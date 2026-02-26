# backend/app/main.py
from typing import List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Query
from psycopg import sql

from .db import get_conn
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
from .degradation import apply_degradation
from .recommendation_engine import recommend
from .gap_engine import compute_gaps

app = FastAPI(title="Bowling Ball Backend", version="1.0.0")


def _validate_arsenal_ids(cur, arsenal_ids: List[str]) -> None:
    """Raise HTTP 400 if any arsenal_ball_id is not in the database."""
    if not arsenal_ids:
        return
    cur.execute(
        "SELECT ball_id FROM balls WHERE ball_id = ANY(%s);",
        (arsenal_ids,),
    )
    found_ids = {r["ball_id"] for r in cur.fetchall()}
    missing = [bid for bid in arsenal_ids if bid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Some arsenal_ball_ids were not found",
                "missing": missing,
            },
        )


def _load_arsenal_balls(cur, arsenal_id: str) -> List[Tuple[dict, int]]:
    """Return [(ball_row, game_count), ...] for arsenal. Raise 404 if arsenal not found."""
    cur.execute(
        "SELECT id, name FROM arsenals WHERE id = %s::uuid;",
        (arsenal_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Arsenal not found")
    cur.execute(
        """
        SELECT ab.ball_id, ab.game_count
        FROM arsenal_balls ab
        WHERE ab.arsenal_id = %s::uuid
        ORDER BY ab.ball_id;
        """,
        (arsenal_id,),
    )
    rows = cur.fetchall()
    if not rows:
        return []
    ball_ids = [r["ball_id"] for r in rows]
    cur.execute(
        "SELECT * FROM balls WHERE ball_id = ANY(%s);",
        (ball_ids,),
    )
    ball_rows = {r["ball_id"]: r for r in cur.fetchall()}
    result = []
    for r in rows:
        bid = r["ball_id"]
        if bid not in ball_rows:
            raise HTTPException(
                status_code=400,
                detail={"message": "Arsenal references missing ball", "missing": [bid]},
            )
        result.append((ball_rows[bid], r["game_count"]))
    return result


@app.get("/health")
def health():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok;")
            row = cur.fetchone()
    return {"status": "ok", "db": row["ok"]}


@app.get("/balls", response_model=BallsResponse)
def list_balls(
    brand: Optional[str] = None,
    coverstock_type: Optional[str] = None,
    symmetry: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = Query(
        default=None, description="Case-insensitive substring match on name"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    where = []
    params = {}

    if brand:
        where.append(sql.SQL("brand = %(brand)s"))
        params["brand"] = brand

    if coverstock_type:
        where.append(sql.SQL("coverstock_type = %(coverstock_type)s"))
        params["coverstock_type"] = coverstock_type

    if symmetry:
        where.append(sql.SQL("symmetry = %(symmetry)s"))
        params["symmetry"] = symmetry

    if status:
        where.append(sql.SQL("status = %(status)s"))
        params["status"] = status

    if q:
        where.append(sql.SQL("name ILIKE %(q)s"))
        params["q"] = f"%{q}%"

    where_sql = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(where) if where else sql.SQL("")
    )

    query_items = sql.SQL(
        """
        SELECT *
        FROM balls
        {where}
        ORDER BY release_date DESC NULLS LAST, ball_id ASC
        LIMIT %(limit)s OFFSET %(offset)s
        """
    ).format(where=where_sql)

    query_count = sql.SQL(
        """
        SELECT COUNT(*)::int AS count
        FROM balls
        {where}
        """
    ).format(where=where_sql)

    params["limit"] = limit
    params["offset"] = offset

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query_count, params)
            count = cur.fetchone()["count"]

            cur.execute(query_items, params)
            rows = cur.fetchall()

    return {"items": rows, "count": count}


@app.get("/balls/{ball_id}", response_model=Ball)
def get_ball(ball_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM balls WHERE ball_id = %s;", (ball_id,))
            row = cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=404, detail=f"Ball not found: {ball_id}"
        )
    return row


@app.post("/arsenals", response_model=ArsenalResponse, status_code=201)
def create_arsenal(req: CreateArsenalRequest):
    ball_ids = [b.ball_id for b in req.balls]
    if ball_ids:
        with get_conn() as conn:
            with conn.cursor() as cur:
                _validate_arsenal_ids(cur, ball_ids)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO arsenals (name) VALUES (%s) RETURNING id, name;",
                (req.name,),
            )
            row = cur.fetchone()
            arsenal_id = str(row["id"])
            for b in req.balls:
                cur.execute(
                    """
                    INSERT INTO arsenal_balls (arsenal_id, ball_id, game_count)
                    VALUES (%s::uuid, %s, %s);
                    """,
                    (arsenal_id, b.ball_id, b.game_count),
                )
        conn.commit()
    return ArsenalResponse(
        id=arsenal_id,
        name=req.name,
        balls=[ArsenalBallResponse(ball_id=b.ball_id, game_count=b.game_count) for b in req.balls],
    )


@app.get("/arsenals", response_model=List[ArsenalSummary])
def list_arsenals(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.id, a.name,
                       (SELECT COUNT(*)::int FROM arsenal_balls ab WHERE ab.arsenal_id = a.id) AS ball_count
                FROM arsenals a
                ORDER BY a.created_at DESC
                LIMIT %s OFFSET %s;
                """,
                (limit, offset),
            )
            rows = cur.fetchall()
    return [
        ArsenalSummary(id=str(r["id"]), name=r["name"], ball_count=r["ball_count"])
        for r in rows
    ]


@app.get("/arsenals/{arsenal_id}", response_model=ArsenalResponse)
def get_arsenal(arsenal_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM arsenals WHERE id = %s::uuid;",
                (arsenal_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Arsenal not found")
            cur.execute(
                """
                SELECT ball_id, game_count
                FROM arsenal_balls
                WHERE arsenal_id = %s::uuid
                ORDER BY ball_id;
                """,
                (arsenal_id,),
            )
            balls = cur.fetchall()
    return ArsenalResponse(
        id=str(row["id"]),
        name=row["name"],
        balls=[ArsenalBallResponse(ball_id=r["ball_id"], game_count=r["game_count"]) for r in balls],
    )


@app.patch("/arsenals/{arsenal_id}", response_model=ArsenalResponse)
def update_arsenal(arsenal_id: str, req: UpdateArsenalRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM arsenals WHERE id = %s::uuid;",
                (arsenal_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Arsenal not found")
            if req.name is not None:
                cur.execute(
                    "UPDATE arsenals SET name = %s WHERE id = %s::uuid;",
                    (req.name, arsenal_id),
                )
            if req.balls is not None:
                ball_ids = [b.ball_id for b in req.balls]
                if ball_ids:
                    _validate_arsenal_ids(cur, ball_ids)
                cur.execute(
                    "DELETE FROM arsenal_balls WHERE arsenal_id = %s::uuid;",
                    (arsenal_id,),
                )
                for b in req.balls:
                    cur.execute(
                        """
                        INSERT INTO arsenal_balls (arsenal_id, ball_id, game_count)
                        VALUES (%s::uuid, %s, %s);
                        """,
                        (arsenal_id, b.ball_id, b.game_count),
                    )
        conn.commit()
    return get_arsenal(arsenal_id)


@app.delete("/arsenals/{arsenal_id}", status_code=204)
def delete_arsenal(arsenal_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM arsenals WHERE id = %s::uuid RETURNING id;",
                (arsenal_id,),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Arsenal not found")
        conn.commit()


def _resolve_arsenal_rows(
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
) -> Tuple[List[dict], List[str]]:
    """Return (arsenal_rows for recommend/gaps, list of arsenal ball_ids). Uses degradation when game_count available."""
    if arsenal_id:
        with get_conn() as conn:
            with conn.cursor() as cur:
                loaded = _load_arsenal_balls(cur, arsenal_id)
        if not loaded:
            return [], []
        effective = [apply_degradation(ball_row, gc) for ball_row, gc in loaded]
        ids = [r["ball_id"] for r in effective]
        return effective, ids
    arsenal_ids = list(dict.fromkeys(arsenal_ball_ids))
    if not arsenal_ids:
        return [], []
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM balls WHERE ball_id = ANY(%s);",
                (arsenal_ids,),
            )
            rows = cur.fetchall()
    if not game_counts:
        return rows, arsenal_ids
    count_map = {bid: game_counts.get(bid, 0) for bid in arsenal_ids}
    effective = [apply_degradation(r, count_map[r["ball_id"]]) for r in rows]
    return effective, arsenal_ids


@app.post("/recommendations", response_model=RecommendResponse)
def recommendations(req: RecommendRequest):
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
    arsenal_rows, arsenal_ids = _resolve_arsenal_rows(
        req.arsenal_id, req.arsenal_ball_ids, req.game_counts
    )
    if req.arsenal_id and not arsenal_ids:
        return {"items": []}
    with get_conn() as conn:
        with conn.cursor() as cur:
            if not req.arsenal_id:
                _validate_arsenal_ids(cur, req.arsenal_ball_ids)
            cur.execute(
                "SELECT * FROM balls WHERE ball_id <> ALL(%s);",
                (arsenal_ids,),
            )
            candidate_rows = cur.fetchall()

    top = recommend(
        arsenal_rows=arsenal_rows, candidate_rows=candidate_rows, k=req.k
    )

    return {
        "items": [{"ball": ball, "score": score} for (ball, score) in top]
    }


@app.post("/gaps", response_model=GapResponse)
def gaps(req: GapRequest):
    if req.arsenal_id and req.arsenal_ball_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide either arsenal_id or arsenal_ball_ids, not both",
        )
    arsenal_rows, arsenal_ids = _resolve_arsenal_rows(
        req.arsenal_id, req.arsenal_ball_ids, req.game_counts
    )
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM balls;")
            catalog_rows = cur.fetchall()
            if not req.arsenal_id and arsenal_ids:
                _validate_arsenal_ids(cur, arsenal_ids)

    arsenal_effective_rows = arsenal_rows if arsenal_rows else None
    top = compute_gaps(
        catalog_rows,
        set(arsenal_ids),
        k=req.k,
        arsenal_effective_rows=arsenal_effective_rows,
    )
    return {
        "items": [{"ball": ball, "gap_score": score} for (ball, score) in top]
    }
