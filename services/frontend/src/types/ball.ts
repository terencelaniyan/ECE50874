/** Mirror of backend api_models for type-safe API usage. */

export interface Ball {
  ball_id: string;
  name: string;
  brand: string;
  rg: number;
  diff: number;
  int_diff: number;
  symmetry: string | null;
  coverstock_type: string | null;
  surface_grit: string | null;
  surface_finish: string | null;
  release_date: string | null;
  status: string | null;
}

/** User-defined ball (not in catalog). ball_id is synthetic e.g. custom-{uuid}. */
export interface CustomBall {
  ball_id: string;
  name?: string | null;
  brand?: string | null;
  rg: number;
  diff: number;
  int_diff: number;
  surface_grit?: string | null;
  surface_finish?: string | null;
}

export interface BallsResponse {
  items: Ball[];
  count: number;
}

/** Discriminated union for arsenal ball input (catalog vs custom). */
export interface ArsenalCatalogBallInput {
  custom: false;
  ball_id: string;
  game_count: number;
}

export interface ArsenalCustomBallInput {
  custom: true;
  name?: string | null;
  brand?: string | null;
  rg: number;
  diff: number;
  int_diff: number;
  surface_grit?: string | null;
  surface_finish?: string | null;
  game_count?: number;
}

export type ArsenalBallInput = ArsenalCatalogBallInput | ArsenalCustomBallInput;

export interface ArsenalBallResponse {
  ball_id: string;
  game_count: number;
}

export interface ArsenalCustomBallResponse {
  id: string;
  name?: string | null;
  brand?: string | null;
  rg: number;
  diff: number;
  int_diff: number;
  surface_grit?: string | null;
  surface_finish?: string | null;
  game_count: number;
}

export interface ArsenalResponse {
  id: string;
  name: string | null;
  balls: ArsenalBallResponse[];
  custom_balls: ArsenalCustomBallResponse[];
}

/** Discriminated bag entry: catalog or custom ball. */
export interface CatalogBagEntry {
  type: "catalog";
  ball: Ball;
  game_count: number;
}

export interface CustomBagEntry {
  type: "custom";
  ball: CustomBall;
  game_count: number;
}

export type BagEntry = CatalogBagEntry | CustomBagEntry;

/** Get stable id for any bag entry (for keys and removal). */
export function getBagEntryId(entry: BagEntry): string {
  return entry.ball.ball_id;
}

/** Build API request payload from bag entries (catalog + custom). */
export function bagEntriesToArsenalBallInputs(entries: BagEntry[]): ArsenalBallInput[] {
  return entries.map((e) => {
    if (e.type === "catalog") {
      return { custom: false as const, ball_id: e.ball.ball_id, game_count: e.game_count };
    }
    return {
      custom: true as const,
      name: e.ball.name ?? undefined,
      brand: e.ball.brand ?? undefined,
      rg: e.ball.rg,
      diff: e.ball.diff,
      int_diff: e.ball.int_diff,
      surface_grit: e.ball.surface_grit ?? undefined,
      surface_finish: e.ball.surface_finish ?? undefined,
      game_count: e.game_count,
    };
  });
}

export interface ArsenalSummary {
  id: string;
  name: string | null;
  ball_count: number;
}

export interface RecommendationItem {
  ball: Ball;
  score: number;
}

export interface RecommendResponse {
  items: RecommendationItem[];
}

export interface GapItem {
  ball: Ball;
  gap_score: number;
}

export interface GapZone {
  center: [number, number];
  label: string;
  description: string;
  balls: GapItem[];
}

export interface GapResponse {
  zones: GapZone[];
}

// ── V2 Recommendation Types ──────────────────────────────────────────────

export interface RecommendV2Item {
  ball: Ball;
  score: number;
  method: string;        // "knn", "two_tower", or "hybrid"
  reason: string | null;
}

export interface RecommendV2Response {
  items: RecommendV2Item[];
  method: string;            // method actually used
  degradation_model: string; // "v1" or "v2"
  normalized: boolean;
}

// ── Slot Assignment Types ───────────────────────────────────────────────

export interface SlotAssignment {
  ball_id: string;
  slot: number;          // 1-6
  slot_name: string;
  slot_description: string;
  rg: number;
  diff: number;
}

export interface SlotCoverage {
  slot: number;
  name: string;
  covered: boolean;
}

export interface SlotAssignResponse {
  assignments: SlotAssignment[];
  best_k: number;
  silhouette_score: number;
  slot_coverage: SlotCoverage[];
}

// ── Degradation Comparison Types ────────────────────────────────────────

export interface DegradationModelResult {
  rg: number;
  diff: number;
  int_diff: number;
  factor: number;
}

export interface DegradationCompareResponse {
  original: DegradationModelResult;
  v1_linear: DegradationModelResult;
  v2_logarithmic: DegradationModelResult;
  game_count: number;
  coverstock_type: string | null;
  v2_lambda: number;
}
