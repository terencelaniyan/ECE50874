# ===========================================================================
# backend/app/services.py
# ---------------------------------------------------------------------------
# Service/CRUD layer: business logic and database queries. Routers in main.py
# call these functions and map results/exceptions to HTTP responses.
# ===========================================================================

from __future__ import annotations

import logging
from typing import Any, List, Optional, Tuple

from psycopg import sql

from .degradation import apply_degradation, apply_degradation_v2, compare_models
from .exceptions import NotFoundError, ValidationError
from .gap_engine import compute_gaps, group_gaps_by_zone, label_zone, zone_description
from .recommendation_engine import recommend

SORT_COLUMNS = frozenset({
    "name", "brand", "release_date", "rg", "diff",
    "coverstock_type", "symmetry", "ball_id",
})
logger = logging.getLogger(__name__)


def validate_ball_ids(cur, ball_ids: List[str]) -> None:
    """
    Verify that all provided ball IDs exist in the balls table.
    
    Args:
        cur: Database cursor.
        ball_ids: List of ball identifiers to check.
        
    Raises:
        ValidationError: If any of the IDs are not found in the database.
    """
    if not ball_ids:
        return
    cur.execute(
        "SELECT ball_id FROM balls WHERE ball_id = ANY(%s);",
        (ball_ids,),
    )
    found_ids = {r["ball_id"] for r in cur.fetchall()}
    missing = [bid for bid in ball_ids if bid not in found_ids]
    if missing:
        raise ValidationError(
            "Some arsenal_ball_ids were not found",
            detail={"missing": missing},
        )


def load_arsenal_balls(cur, arsenal_id: str) -> List[Tuple[dict, int]]:
    """
    Fetch all catalog balls belonging to a specific arsenal along with their game counts.

    Does not load custom balls; use load_custom_arsenal_balls for those.
    """
    cur.execute(
        "SELECT id, name FROM arsenals WHERE id = %s::uuid;",
        (arsenal_id,),
    )
    row = cur.fetchone()
    if not row:
        raise NotFoundError("Arsenal not found")
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
            raise ValidationError(
                "Arsenal references missing ball",
                detail={"missing": [bid]},
            )
        result.append((ball_rows[bid], r["game_count"]))
    return result


def load_custom_arsenal_balls(cur, arsenal_id: str) -> List[Tuple[dict, int]]:
    """
    Fetch all custom balls for an arsenal with their game counts.

    Returns list of (row_dict, game_count). Each row_dict has id, arsenal_id, name, brand,
    rg, diff, int_diff, surface_grit, surface_finish, game_count (and will get ball_id
    set to synthetic when building engine rows).
    """
    cur.execute(
        """
        SELECT id, arsenal_id, name, brand, rg, diff, int_diff,
               surface_grit, surface_finish, game_count
        FROM arsenal_custom_balls
        WHERE arsenal_id = %s::uuid
        ORDER BY id;
        """,
        (arsenal_id,),
    )
    rows = cur.fetchall()
    return [(dict(r), r["game_count"]) for r in rows]


def _get_arsenal_custom_balls(conn, arsenal_id: str) -> List[dict]:
    """Return custom ball records for an arsenal (for API response)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, brand, rg, diff, int_diff, surface_grit, surface_finish, game_count
            FROM arsenal_custom_balls
            WHERE arsenal_id = %s::uuid
            ORDER BY id;
            """,
            (arsenal_id,),
        )
        rows = cur.fetchall()
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "brand": r["brand"],
            "rg": float(r["rg"]),
            "diff": float(r["diff"]),
            "int_diff": float(r["int_diff"]),
            "surface_grit": r["surface_grit"],
            "surface_finish": r["surface_finish"],
            "game_count": r["game_count"],
        }
        for r in rows
    ]


def check_health(conn) -> dict:
    """Return health status including DB connectivity."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 AS ok;")
        row = cur.fetchone()
    return {"status": "ok", "db": row["ok"]}


def list_balls(
    conn,
    *,
    brand: Optional[str] = None,
    coverstock_type: Optional[str] = None,
    symmetry: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "release_date",
    order: str = "desc",
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[dict], int]:
    """
    Search and filter the bowling ball catalog.
    
    Args:
        conn: Database connection.
        brand: Optional brand filter (case-insensitive substring).
        coverstock_type: Optional coverstock type filter (case-insensitive substring).
        symmetry: Optional symmetry filter (case-insensitive substring).
        status: Optional status filter (exact match).
        q: Optional search query for name, brand, or coverstock.
        sort: Column to sort by (defaults to release_date).
        order: Sort direction (asc or desc).
        limit: Max items to return.
        offset: Items to skip.
        
    Returns:
        Tuple[List[dict], int]: A list of ball row dictionaries and the total 
                               count of matching results.
    """
    where = []
    params: dict[str, Any] = {}
    brand = (brand or "").strip() or None
    coverstock_type = (coverstock_type or "").strip() or None
    symmetry = (symmetry or "").strip() or None
    q = (q or "").strip() or None

    if brand:
        where.append(sql.SQL("brand ILIKE %(brand)s"))
        params["brand"] = f"%{brand}%"
    if coverstock_type:
        where.append(sql.SQL("coverstock_type ILIKE %(coverstock_type)s"))
        params["coverstock_type"] = f"%{coverstock_type}%"
    if symmetry:
        where.append(sql.SQL("symmetry ILIKE %(symmetry)s"))
        params["symmetry"] = f"%{symmetry}%"
    if status:
        where.append(sql.SQL("status = %(status)s"))
        params["status"] = status
    if q:
        where.append(
            sql.SQL(
                "(name ILIKE %(q)s OR brand ILIKE %(q)s OR "
                "coverstock_type ILIKE %(q)s)"
            )
        )
        params["q"] = f"%{q}%"

    where_sql = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(where)
        if where else sql.SQL("")
    )
    sort_col = sort if sort in SORT_COLUMNS else "release_date"
    order_dir = (
        sql.SQL("DESC") if (order or "").lower() == "desc" else sql.SQL("ASC")
    )
    order_sql = sql.SQL(
        " ORDER BY {col} {dir} NULLS LAST, ball_id ASC"
    ).format(col=sql.Identifier(sort_col), dir=order_dir)

    query_items = sql.SQL(
        """
        SELECT *
        FROM balls
        {where}
        {order}
        LIMIT %(limit)s OFFSET %(offset)s
        """
    ).format(where=where_sql, order=order_sql)
    query_count = sql.SQL(
        "SELECT COUNT(*)::int AS count FROM balls {where}"
    ).format(where=where_sql)
    params["limit"] = limit
    params["offset"] = offset

    with conn.cursor() as cur:
        cur.execute(query_count, params)
        count = cur.fetchone()["count"]
        cur.execute(query_items, params)
        rows = cur.fetchall()
    return rows, count


def get_ball(conn, ball_id: str) -> Optional[dict]:
    """Return ball row or None if not found."""
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM balls WHERE ball_id = %s;", (ball_id,))
        return cur.fetchone()


def create_arsenal(
    conn,
    name: Optional[str],
    balls: List[dict],
    custom_balls: Optional[List[dict]] = None,
) -> dict:
    """
    Create a new arsenal and its associated catalog and custom balls in one transaction.

    balls: list of {ball_id, game_count}. custom_balls: list of {name?, brand?, rg, diff,
    int_diff, surface_grit?, surface_finish?, game_count?}. On any failure, entire
    operation is rolled back.
    """
    custom_balls = custom_balls or []
    ball_ids = [b["ball_id"] for b in balls]
    try:
        with conn.cursor() as cur:
            if ball_ids:
                validate_ball_ids(cur, ball_ids)
            cur.execute(
                "INSERT INTO arsenals (name) VALUES (%s) RETURNING id, name;",
                (name,),
            )
            row = cur.fetchone()
            arsenal_id = str(row["id"])
            for b in balls:
                cur.execute(
                    """
                    INSERT INTO arsenal_balls (arsenal_id, ball_id, game_count)
                    VALUES (%s::uuid, %s, %s);
                    """,
                    (arsenal_id, b["ball_id"], b["game_count"]),
                )
            for cb in custom_balls:
                gc = cb.get("game_count", 0)
                cur.execute(
                    """
                    INSERT INTO arsenal_custom_balls
                    (arsenal_id, name, brand, rg, diff, int_diff, surface_grit, surface_finish, game_count)
                    VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        arsenal_id,
                        cb.get("name"),
                        cb.get("brand"),
                        float(cb["rg"]),
                        float(cb["diff"]),
                        float(cb["int_diff"]),
                        cb.get("surface_grit"),
                        cb.get("surface_finish"),
                        gc,
                    ),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    balls_out = [
        {"ball_id": b["ball_id"], "game_count": b["game_count"]} for b in balls
    ]
    custom_out = _get_arsenal_custom_balls(conn, arsenal_id)
    return {"id": arsenal_id, "name": name, "balls": balls_out, "custom_balls": custom_out}


def list_arsenals(conn, limit: int = 50, offset: int = 0) -> List[dict]:
    """
    Retrieve a paginated list of all arsenals.
    
    Args:
        conn: Database connection.
        limit: Max items to return.
        offset: Items to skip.
        
    Returns:
        List[dict]: A list of dictionaries, each containing arsenal ID, 
                    name, and the number of balls it contains.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.name,
                (SELECT COUNT(*)::int FROM arsenal_balls ab WHERE ab.arsenal_id = a.id)
                + (SELECT COUNT(*)::int FROM arsenal_custom_balls acb WHERE acb.arsenal_id = a.id)
                AS ball_count
            FROM arsenals a
            ORDER BY a.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            (limit, offset),
        )
        rows = cur.fetchall()
    return [
        {"id": str(r["id"]), "name": r["name"], "ball_count": r["ball_count"]}
        for r in rows
    ]


def get_arsenal(conn, arsenal_id: str) -> dict:
    """
    Retrieve detailed information for a single arsenal.
    
    Args:
        conn: Database connection.
        arsenal_id: UUID of the arsenal.
        
    Returns:
        dict: Arsenal details including its name and list of balls.
        
    Raises:
        NotFoundError: If the arsenal does not exist.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM arsenals WHERE id = %s::uuid;",
            (arsenal_id,),
        )
        row = cur.fetchone()
        if not row:
            raise NotFoundError("Arsenal not found")
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
    balls_out = [
        {"ball_id": r["ball_id"], "game_count": r["game_count"]} for r in balls
    ]
    custom_out = _get_arsenal_custom_balls(conn, arsenal_id)
    return {"id": str(row["id"]), "name": row["name"], "balls": balls_out, "custom_balls": custom_out}


def update_arsenal(
    conn,
    arsenal_id: str,
    name: Optional[str] = None,
    balls: Optional[List[dict]] = None,
    custom_balls: Optional[List[dict]] = None,
) -> None:
    """
    Update an arsenal's name and/or catalog and custom balls in one transaction.
    On any failure, the whole operation is rolled back.
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM arsenals WHERE id = %s::uuid;",
                (arsenal_id,),
            )
            row = cur.fetchone()
            if not row:
                raise NotFoundError("Arsenal not found")
            if name is not None:
                cur.execute(
                    "UPDATE arsenals SET name = %s WHERE id = %s::uuid;",
                    (name, arsenal_id),
                )
            if balls is not None:
                ball_ids = [b["ball_id"] for b in balls]
                if ball_ids:
                    validate_ball_ids(cur, ball_ids)
                cur.execute(
                    "DELETE FROM arsenal_balls WHERE arsenal_id = %s::uuid;",
                    (arsenal_id,),
                )
                for b in balls:
                    cur.execute(
                        """
                        INSERT INTO arsenal_balls (arsenal_id, ball_id, game_count)
                        VALUES (%s::uuid, %s, %s);
                        """,
                        (arsenal_id, b["ball_id"], b["game_count"]),
                    )
            if custom_balls is not None:
                cur.execute(
                    "DELETE FROM arsenal_custom_balls WHERE arsenal_id = %s::uuid;",
                    (arsenal_id,),
                )
                for cb in custom_balls:
                    gc = cb.get("game_count", 0)
                    cur.execute(
                        """
                        INSERT INTO arsenal_custom_balls
                        (arsenal_id, name, brand, rg, diff, int_diff, surface_grit, surface_finish, game_count)
                        VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s);
                        """,
                        (
                            arsenal_id,
                            cb.get("name"),
                            cb.get("brand"),
                            float(cb["rg"]),
                            float(cb["diff"]),
                            float(cb["int_diff"]),
                            cb.get("surface_grit"),
                            cb.get("surface_finish"),
                            gc,
                        ),
                    )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def delete_arsenal(conn, arsenal_id: str) -> None:
    """
    Delete an arsenal and its associated ball mappings.
    
    Args:
        conn: Database connection.
        arsenal_id: UUID of the arsenal to delete.
        
    Raises:
        NotFoundError: If the arsenal does not exist.
    """
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM arsenals WHERE id = %s::uuid RETURNING id;",
            (arsenal_id,),
        )
        if cur.fetchone() is None:
            raise NotFoundError("Arsenal not found")
    conn.commit()


def _custom_row_to_engine_row(custom_dict: dict, game_count: int) -> Tuple[dict, int]:
    """Convert a custom ball DB row to engine row shape and return (row, game_count)."""
    row = {
        "ball_id": f"custom-{str(custom_dict['id'])}",
        "name": custom_dict.get("name") or "Custom",
        "brand": custom_dict.get("brand"),
        "rg": float(custom_dict["rg"]),
        "diff": float(custom_dict["diff"]),
        "int_diff": float(custom_dict["int_diff"]),
        "surface_grit": custom_dict.get("surface_grit"),
        "surface_finish": custom_dict.get("surface_finish"),
    }
    return row, game_count


def _apply_degradation_to_rows(rows_with_gc: List[Tuple[dict, int]]) -> List[dict]:
    """Apply degradation to each (row, game_count) and return list of effective rows."""
    return [apply_degradation(row, gc) for row, gc in rows_with_gc]


def resolve_arsenal_rows(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
) -> Tuple[List[dict], List[str]]:
    """
    Resolve arsenal ID or ad-hoc ball IDs into degraded ball rows for engines.
    Uses helpers to load catalog vs custom, apply degradation, and merge.
    """
    if arsenal_id:
        with conn.cursor() as cur:
            catalog_loaded = load_arsenal_balls(cur, arsenal_id)
            custom_loaded = load_custom_arsenal_balls(cur, arsenal_id)
        catalog_with_gc = catalog_loaded
        custom_with_gc = [_custom_row_to_engine_row(d, gc) for d, gc in custom_loaded]
        all_with_gc = catalog_with_gc + custom_with_gc
        effective = _apply_degradation_to_rows(all_with_gc)
        ids = [r["ball_id"] for r in effective]
        return effective, ids
    arsenal_ids = list(dict.fromkeys(arsenal_ball_ids))
    if not arsenal_ids:
        return [], []
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


def get_recommendations(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
    k: int,
    w_rg: float = 1.0,
    w_diff: float = 1.0,
    w_int: float = 1.0,
    brand: Optional[str] = None,
    coverstock_type: Optional[str] = None,
    status: Optional[str] = None,
    diversity_min_distance: float = 0.0,
) -> List[Tuple[dict, float]]:
    """
    Generate bowling ball recommendations based on a user's arsenal.
    
    Args:
        conn: Database connection.
        arsenal_id: UUID of a saved arsenal to use as base.
        arsenal_ball_ids: List of ball IDs to use as an ad-hoc arsenal.
        game_counts: Mapping of ball_id to games for degradation calculation.
        k: Number of recommendations to return.
        w_rg: Weight for RG similarity.
        w_diff: Weight for differential similarity.
        w_int: Weight for intermediate differential similarity.
        brand: Optional brand filter for candidates.
        coverstock_type: Optional coverstock type filter for candidates.
        status: Optional status filter for candidates.
        diversity_min_distance: Minimum distance between recommendations to ensure variety.
        
    Returns:
        List[Tuple[dict, float]]: Top-k recommended balls with their similarity scores.
    """
    arsenal_rows, arsenal_ids = resolve_arsenal_rows(
        conn, arsenal_id, arsenal_ball_ids, game_counts
    )
    if arsenal_id and not arsenal_ids:
        return []
    brand = (brand or "").strip() or None
    coverstock_type = (coverstock_type or "").strip() or None
    status = (status or "").strip() or None
    with conn.cursor() as cur:
        if not arsenal_id and arsenal_ball_ids:
            validate_ball_ids(cur, arsenal_ball_ids)
        where = [sql.SQL("ball_id <> ALL(%(arsenal_ids)s)")]
        params: dict = {"arsenal_ids": arsenal_ids}
        if brand:
            where.append(sql.SQL("brand ILIKE %(brand)s"))
            params["brand"] = f"%{brand}%"
        if coverstock_type:
            where.append(sql.SQL("coverstock_type ILIKE %(coverstock_type)s"))
            params["coverstock_type"] = f"%{coverstock_type}%"
        if status:
            where.append(sql.SQL("status = %(status)s"))
            params["status"] = status
        query = sql.SQL("SELECT * FROM balls WHERE {}").format(
            sql.SQL(" AND ").join(where)
        )
        cur.execute(query, params)
        candidate_rows = cur.fetchall()
    return recommend(
        arsenal_rows=arsenal_rows,
        candidate_rows=candidate_rows,
        k=k,
        w_rg=w_rg,
        w_diff=w_diff,
        w_int=w_int,
        diversity_min_distance=diversity_min_distance,
    )


def get_gaps(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
    k: int,
    zone_threshold: float = 0.05,
) -> List[dict]:
    """
    Identify coverage gaps in a user's arsenal and group them into logical zones.
    
    Args:
        conn: Database connection.
        arsenal_id: UUID of a saved arsenal.
        arsenal_ball_ids: List of ad-hoc ball IDs.
        game_counts: Mapping of ball_id to games for degradation.
        k: Number of gap balls to identify.
        zone_threshold: Distance threshold for clustering balls into zones.
        
    Returns:
        List[dict]: A list of gap zones, each with a center, label, and list of balls.
    """
    arsenal_rows, arsenal_ids = resolve_arsenal_rows(
        conn, arsenal_id, arsenal_ball_ids, game_counts
    )
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM balls;")
        catalog_rows = cur.fetchall()
        if not arsenal_id and arsenal_ids:
            real_ids = [bid for bid in arsenal_ids if not bid.startswith("custom-")]
            if real_ids:
                validate_ball_ids(cur, real_ids)
    arsenal_effective_rows = arsenal_rows if arsenal_rows else None
    top = compute_gaps(
        catalog_rows,
        set(arsenal_ids),
        k=k,
        arsenal_effective_rows=arsenal_effective_rows,
    )
    zones = group_gaps_by_zone(top, threshold=zone_threshold)
    for zone in zones:
        c = zone["center"]
        zone["label"] = label_zone(c[0], c[1])
        zone["description"] = zone_description(c[0], c[1])
    return zones


# ── V2 Recommendations ──────────────────────────────────────────────────

def _apply_degradation_v2_to_rows(rows_with_gc: List[Tuple[dict, int]]) -> List[dict]:
    """Apply v2 degradation to each (row, game_count)."""
    return [apply_degradation_v2(row, gc) for row, gc in rows_with_gc]


def resolve_arsenal_rows_v2(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
    degradation_model: str = "v1",
) -> Tuple[List[dict], List[str]]:
    """Like resolve_arsenal_rows but supports v2 degradation."""
    if degradation_model == "v2":
        if arsenal_id:
            with conn.cursor() as cur:
                catalog_loaded = load_arsenal_balls(cur, arsenal_id)
                custom_loaded = load_custom_arsenal_balls(cur, arsenal_id)
            custom_with_gc = [_custom_row_to_engine_row(d, gc) for d, gc in custom_loaded]
            all_with_gc = catalog_loaded + custom_with_gc
            effective = _apply_degradation_v2_to_rows(all_with_gc)
            ids = [r["ball_id"] for r in effective]
            return effective, ids
        arsenal_ids = list(dict.fromkeys(arsenal_ball_ids))
        if not arsenal_ids:
            return [], []
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM balls WHERE ball_id = ANY(%s);", (arsenal_ids,))
            rows = cur.fetchall()
        if not game_counts:
            return rows, arsenal_ids
        count_map = {bid: game_counts.get(bid, 0) for bid in arsenal_ids}
        effective = [apply_degradation_v2(r, count_map[r["ball_id"]]) for r in rows]
        return effective, arsenal_ids
    return resolve_arsenal_rows(conn, arsenal_id, arsenal_ball_ids, game_counts)


def get_recommendations_v2(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
    k: int,
    w_rg: float = 1.0,
    w_diff: float = 1.0,
    w_int: float = 1.0,
    w_cover: float = 0.3,
    method: str = "knn",
    metric: str = "l1",
    normalize: bool = False,
    degradation_model: str = "v1",
    brand: Optional[str] = None,
    coverstock_type: Optional[str] = None,
    status: Optional[str] = None,
    diversity_min_distance: float = 0.0,
) -> dict:
    """V2 recommendations with method selection (KNN, two-tower, or hybrid)."""
    arsenal_rows, arsenal_ids = resolve_arsenal_rows_v2(
        conn, arsenal_id, arsenal_ball_ids, game_counts, degradation_model
    )
    if arsenal_id and not arsenal_ids:
        return {"items": [], "method": method, "degradation_model": degradation_model, "normalized": normalize}

    brand = (brand or "").strip() or None
    coverstock_type = (coverstock_type or "").strip() or None
    status = (status or "").strip() or None

    from psycopg import sql as psql
    with conn.cursor() as cur:
        if not arsenal_id and arsenal_ball_ids:
            validate_ball_ids(cur, arsenal_ball_ids)
        where = [psql.SQL("ball_id <> ALL(%(arsenal_ids)s)")]
        params: dict = {"arsenal_ids": arsenal_ids}
        if brand:
            where.append(psql.SQL("brand ILIKE %(brand)s"))
            params["brand"] = f"%{brand}%"
        if coverstock_type:
            where.append(psql.SQL("coverstock_type ILIKE %(coverstock_type)s"))
            params["coverstock_type"] = f"%{coverstock_type}%"
        if status:
            where.append(psql.SQL("status = %(status)s"))
            params["status"] = status
        query = psql.SQL("SELECT * FROM balls WHERE {}").format(
            psql.SQL(" AND ").join(where)
        )
        cur.execute(query, params)
        candidate_rows = cur.fetchall()

    actual_method = method
    items = []

    # Try two-tower if requested
    if method in ("two_tower", "hybrid"):
        try:
            from .two_tower import get_two_tower_recommendations
            tt_items = get_two_tower_recommendations(arsenal_rows, candidate_rows, k=k)
            if tt_items:
                items = [{"ball": b, "score": s, "method": "two_tower", "reason": None} for b, s in tt_items]
                actual_method = "two_tower"
        except Exception as exc:
            logger.warning("Two-tower recommendation path failed, falling back to KNN: %s", exc)

    # KNN fallback or explicit knn
    if not items or method == "hybrid":
        knn_items = recommend(
            arsenal_rows=arsenal_rows,
            candidate_rows=candidate_rows,
            k=k,
            w_rg=w_rg,
            w_diff=w_diff,
            w_int=w_int,
            w_cover=w_cover,
            normalize=normalize,
            metric=metric,
            diversity_min_distance=diversity_min_distance,
        )
        knn_results = [{"ball": b, "score": s, "method": "knn", "reason": None} for b, s in knn_items]

        if method == "hybrid" and items:
            # Merge: interleave two-tower and knn, deduplicate
            seen = set()
            merged = []
            for item in items + knn_results:
                ball_obj = item["ball"]
                bid = ball_obj["ball_id"] if isinstance(ball_obj, dict) else getattr(ball_obj, "ball_id")
                if bid not in seen:
                    seen.add(bid)
                    merged.append(item)
            items = merged[:k]
            actual_method = "hybrid"
        elif not items:
            items = knn_results
            actual_method = "knn"

    return {
        "items": items,
        "method": actual_method,
        "degradation_model": degradation_model,
        "normalized": normalize,
    }


# ── Slot Assignment ─────────────────────────────────────────────────────

def get_slot_assignments(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
) -> dict:
    """Assign arsenal balls to the 6-ball slot system."""
    from .slot_assignment import assign_slots
    if not arsenal_id and arsenal_ball_ids:
        with conn.cursor() as cur:
            validate_ball_ids(cur, arsenal_ball_ids)
    arsenal_rows, arsenal_ids = resolve_arsenal_rows(
        conn, arsenal_id, arsenal_ball_ids, game_counts
    )
    if not arsenal_rows:
        return {"assignments": [], "best_k": 0, "silhouette_score": 0.0, "slot_coverage": []}
    return assign_slots(arsenal_rows)


# ── Degradation Comparison ──────────────────────────────────────────────

def get_degradation_comparison(ball_row: dict, game_count: int) -> dict:
    """Compare v1 vs v2 degradation models for a given ball."""
    return compare_models(ball_row, game_count)


# ── Two-Tower Training ──────────────────────────────────────────────────

def train_two_tower(
    conn,
    n_arsenals: int = 500,
    epochs: int = 20,
    batch_size: int = 64,
    lr: float = 0.001,
    neg_ratio: int = 3,
) -> dict:
    """Train the two-tower model on synthetic arsenal data."""
    try:
        from .two_tower import train_model
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM balls;")
            catalog = cur.fetchall()
        if not catalog:
            return {"error": "No balls in catalog to train on"}
        result = train_model(
            catalog=catalog,
            n_arsenals=n_arsenals,
            epochs=epochs,
            batch_size=batch_size,
            lr=lr,
            neg_ratio=neg_ratio,
        )
        if result is None:
            return {"error": "PyTorch not available for training"}
        return result
    except Exception as e:
        logger.exception("Two-tower training failed")
        return {"error": str(e)}


# ── Oil Patterns ────────────────────────────────────────────────────────

def list_oil_patterns(conn) -> List[dict]:
    """List all oil patterns from the database."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, name, length_ft, description, zones FROM oil_patterns ORDER BY length_ft;")
        rows = cur.fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "length_ft": r["length_ft"],
            "description": r["description"],
            "zones": r["zones"] if isinstance(r["zones"], list) else [],
        }
        for r in rows
    ]
