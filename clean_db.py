from services.backend.app.db import get_conn
import json

with get_conn() as conn:
    with conn.cursor() as cur:
        # Get all arsenals
        cur.execute("SELECT id, name FROM arsenals ORDER BY created_at ASC")
        rows = cur.fetchall()
        
        seen = set()
        to_delete = []
        for r in rows:
            name = r['name']
            if name is None or name.strip() == "":
                name = "unnamed"
            else:
                name = name.strip()
            
            if name in seen:
                to_delete.append(r['id'])
            else:
                seen.add(name)
        
        if to_delete:
            print(f"Found {len(to_delete)} duplicates to delete.")
            # delete custom_balls and arsenal_balls via cascade if enabled, else manually
            cur.execute("DELETE FROM arsenal_balls WHERE arsenal_id = ANY(%s)", (to_delete,))
            cur.execute("DELETE FROM custom_balls WHERE arsenal_id = ANY(%s)", (to_delete,))
            cur.execute("DELETE FROM arsenals WHERE id = ANY(%s)", (to_delete,))
            conn.commit()
            print("Deleted duplicates.")
        else:
            print("No duplicates found.")
            
        cur.execute("SELECT id, name FROM arsenals ORDER BY created_at DESC")
        print("Remaining arsenals:")
        for r in cur.fetchall():
            print(r)
