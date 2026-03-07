# ===========================================================================
# backend/app/services.py
# ---------------------------------------------------------------------------
# Service/CRUD layer: business logic and database queries. Routers in main.py
# call these functions and map results/exceptions to HTTP responses.
# ===========================================================================

from __future__ import annotations

from typing import Any, List, Optional, Tuple

from psycopg import sql

from .degradation import apply_degradation
from .exceptions import NotFoundError, ValidationError
from .gap_engine import compute_gaps, group_gaps_by_zone, label_zone, zone_description
from .recommendation_engine import recommend

SORT_COLUMNS = frozenset({
    "name", "brand", "release_date", "rg", "diff",
    "coverstock_type", "symmetry", "ball_id",
})


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
    Fetch all balls belonging to a specific arsenal along with their game counts.
    
    Args:
        cur: Database cursor.
        arsenal_id: UUID of the arsenal.
        
    Returns:
        List[Tuple[dict, int]]: A list of tuples, each containing a ball's row data 
                                and its corresponding game count in the arsenal.
                                
    Raises:
        NotFoundError: If the arsenal does not exist.
        ValidationError: If the arsenal references ball IDs that aren't in the catalog.
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


def create_arsenal(conn, name: Optional[str], balls: List[dict]) -> dict:
    """
    Create a new arsenal and its associated balls.
    
    Args:
        conn: Database connection.
        name: Display name for the arsenal.
        balls: List of items with ball_id and game_count.
        
    Returns:
        dict: A dictionary containing the new arsenal's ID, name, and balls.
        
    Raises:
        ValidationError: If any of the referenced balls do not exist.
    """
    ball_ids = [b["ball_id"] for b in balls]
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
    conn.commit()
    balls_out = [
        {"ball_id": b["ball_id"], "game_count": b["game_count"]} for b in balls
    ]
    return {"id": arsenal_id, "name": name, "balls": balls_out}


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
                (SELECT COUNT(*)::int FROM arsenal_balls ab
                 WHERE ab.arsenal_id = a.id) AS ball_count
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
    return {"id": str(row["id"]), "name": row["name"], "balls": balls_out}


def update_arsenal(
    conn,
    arsenal_id: str,
    name: Optional[str] = None,
    balls: Optional[List[dict]] = None,
) -> None:
    """
    Update an arsenal's name and/or its collection of balls.
    
    Args:
        conn: Database connection.
        arsenal_id: UUID of the arsenal to update.
        name: New display name (optional).
        balls: New list of ball dictionary objects (optional).
        
    Raises:
        NotFoundError: If the arsenal does not exist.
        ValidationError: If any of the new ball IDs are invalid.
    """
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
    conn.commit()


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


def resolve_arsenal_rows(
    conn,
    arsenal_id: Optional[str],
    arsenal_ball_ids: List[str],
    game_counts: Optional[dict],
) -> Tuple[List[dict], List[str]]:
    """
    Resolve a set of ball IDs or an arsenal ID into actual ball row data,
    applying performance degradation based on game counts.
    
    Args:
        conn: Database connection.
        arsenal_id: Optional UUID of a saved arsenal.
        arsenal_ball_ids: Optional list of ad-hoc ball IDs.
        game_counts: Optional mapping of ball_id to games bowled.
        
    Returns:
        Tuple[List[dict], List[str]]: A tuple containing the list of potentially 
                                     degraded ball rows and the list of ball IDs.
    """
    if arsenal_id:
        with conn.cursor() as cur:
            loaded = load_arsenal_balls(cur, arsenal_id)
        if not loaded:
            return [], []
        effective = [apply_degradation(ball_row, gc) for ball_row, gc in loaded]
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
            validate_ball_ids(cur, arsenal_ids)
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
