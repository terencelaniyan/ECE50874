#!/usr/bin/env python3
"""
Scrape bowling ball specifications from the Bowling This Month (BTM)
ball comparison table and write them to data/balls.csv.

The BTM table uses DataTables with server-side AJAX pagination.  This
script uses Playwright (headless Chromium) to render the page, select
"Show All", and then extract every row.

Usage
-----
    pip install playwright python-dateutil
    playwright install chromium
    python scripts/scrape_btm.py            # scrape all balls
    python scripts/scrape_btm.py --limit 300 # stop after 300 records
    python scripts/scrape_btm.py --dry-run   # print but don't write CSV

robots.txt compliance
---------------------
BTM's robots.txt only blocks /wp-admin/.  Product / review pages are
allowed.  The script adds a 2-second delay between pagination clicks
to be polite.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Field mapping helpers
# ---------------------------------------------------------------------------

COVER_MAP: dict[str, str] = {
    "R Sol":   "Solid Reactive",
    "R Prl":   "Pearl Reactive",
    "R Hyb":   "Hybrid Reactive",
    "Ure Sol": "Urethane Solid",
    "Ure Prl": "Urethane Pearl",
    "Ure Hyb": "Urethane Hybrid",
    "Poly":    "Polyester",
    "Poly Prl": "Polyester Pearl",
    "Poly Sol": "Polyester Solid",
    "P Prl":   "Polyester Pearl",
    "P Sol":   "Polyester Solid",
    "Not Urethane":       "Non-Urethane",
    "Microcell Polymer":  "Microcell Polymer",
}

MONTH_MAP: dict[str, int] = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def parse_issue_to_date(issue: str) -> Optional[str]:
    """Convert BTM issue like 'February 2026' to ISO date '2026-02-01'."""
    issue = (issue or "").strip()
    if not issue:
        return None
    parts = issue.lower().split()
    if len(parts) != 2:
        return None
    month_str, year_str = parts
    month = MONTH_MAP.get(month_str)
    if month is None:
        return None
    try:
        year = int(year_str)
    except ValueError:
        return None
    return date(year, month, 1).isoformat()


def expand_coverstock(abbrev: str) -> Optional[str]:
    """Expand BTM coverstock abbreviation to full name."""
    abbrev = (abbrev or "").strip()
    if not abbrev:
        return None
    return COVER_MAP.get(abbrev, abbrev)


def safe_float(val: str, default: float = 0.0) -> float:
    """Parse a float, returning *default* on failure."""
    val = (val or "").strip()
    if not val:
        return default
    try:
        return float(val)
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# CSV schema (must match data/balls.csv header)
# ---------------------------------------------------------------------------

CSV_COLUMNS = [
    "name",
    "brand",
    "rg",
    "diff",
    "int_diff",
    "symmetry",
    "coverstock_type",
    "surface_grit",
    "surface_finish",
    "release_date",
    "status",
]


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

def scrape(*, limit: int | None = None, dry_run: bool = False) -> list[dict]:
    """
    Launch headless Chromium, load the BTM ball comparison table,
    extract all rows, and (unless dry_run) write data/balls.csv.
    """
    from playwright.sync_api import sync_playwright  # noqa: late import

    url = "https://www.bowlingthismonth.com/bowling-ball-reviews/ball-comparison-table/"
    repo_root = Path(__file__).resolve().parents[1]
    csv_path = repo_root / "data" / "balls.csv"

    print(f"[scrape_btm] Launching headless browser …")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_extra_http_headers({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        })

        print(f"[scrape_btm] Navigating to {url}")
        page.goto(url, wait_until="networkidle", timeout=60_000)

        # Wait for DataTables to initialise
        page.wait_for_selector("#ball-comparison-table tbody tr", timeout=30_000)
        print("[scrape_btm] Table loaded – selecting 'Show All' …")

        # Try to select "Show All" (-1) from the length dropdown to load
        # every record at once.  Fall back to pagination if that fails.
        try:
            page.select_option(
                "select[name='ball-comparison-table_length']",
                value="-1",
            )
            # Wait for the table to finish re-rendering (the AJAX call
            # fetches all 1 000+ rows, so give it a generous timeout).
            page.wait_for_load_state("networkidle", timeout=120_000)
            time.sleep(3)  # extra settle time
            print("[scrape_btm] 'Show All' loaded successfully.")
            use_pagination = False
        except Exception as exc:
            print(f"[scrape_btm] Could not select 'Show All' ({exc}) – "
                  f"falling back to pagination.")
            use_pagination = True

        # ----------------------------------------------------------------
        # Extract rows
        # ----------------------------------------------------------------
        all_rows: list[dict] = []

        def _extract_visible_rows() -> list[dict]:
            """Read the currently visible <tr> elements."""
            trs = page.query_selector_all("#ball-comparison-table tbody tr")
            rows: list[dict] = []
            for tr in trs:
                cells = tr.query_selector_all("td")
                if len(cells) < 8:
                    continue
                texts = [c.inner_text().strip() for c in cells]

                rg_val = safe_float(texts[5])
                diff_val = safe_float(texts[6])
                int_diff_val = safe_float(texts[7])

                row = {
                    "brand":          texts[0],
                    "name":           texts[1],
                    "release_date":   parse_issue_to_date(texts[2]) or "",
                    "coverstock_type": expand_coverstock(texts[3]) or "",
                    "surface_grit":   texts[4],
                    "surface_finish": texts[4],
                    "rg":             rg_val,
                    "diff":           diff_val,
                    "int_diff":       int_diff_val,
                    "symmetry":       "Asymmetric" if int_diff_val > 0 else "Symmetric",
                    "status":         "Active",
                }
                rows.append(row)
            return rows

        if not use_pagination:
            all_rows = _extract_visible_rows()
            print(f"[scrape_btm] Extracted {len(all_rows)} rows (all-at-once).")
        else:
            # Paginate through 100 rows at a time
            page_num = 1
            while True:
                batch = _extract_visible_rows()
                if not batch:
                    break
                all_rows.extend(batch)
                print(f"[scrape_btm]   Page {page_num}: +{len(batch)} rows "
                      f"(total {len(all_rows)})")

                if limit and len(all_rows) >= limit:
                    break

                # Click "Next" button
                next_btn = page.query_selector(
                    "#ball-comparison-table_next:not(.disabled)"
                )
                if next_btn is None:
                    break
                next_btn.click()
                time.sleep(2)  # polite delay
                page.wait_for_load_state("networkidle", timeout=30_000)
                page_num += 1

        browser.close()

    # ----------------------------------------------------------------
    # Deduplicate (same name + brand = same ball)
    # ----------------------------------------------------------------
    seen: set[str] = set()
    unique_rows: list[dict] = []
    for r in all_rows:
        key = (r["brand"].lower(), r["name"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique_rows.append(r)

    if limit:
        unique_rows = unique_rows[:limit]

    print(f"\n[scrape_btm] {len(unique_rows)} unique balls after deduplication.")

    if dry_run:
        print("[scrape_btm] --dry-run: not writing CSV. First 5 rows:")
        for r in unique_rows[:5]:
            print(f"  {r['brand']:15s}  {r['name']:30s}  "
                  f"RG={r['rg']}  diff={r['diff']}  int_diff={r['int_diff']}")
        return unique_rows

    # ----------------------------------------------------------------
    # Write CSV
    # ----------------------------------------------------------------
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(unique_rows)

    print(f"[scrape_btm] Wrote {len(unique_rows)} records to {csv_path}")
    return unique_rows


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape bowling ball specs from BTM ball comparison table."
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max number of balls to include (default: all).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Extract data but don't write to CSV.",
    )
    args = parser.parse_args()
    scrape(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
