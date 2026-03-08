import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Ball, CustomBall } from "../types/ball";
import type { BagEntry } from "../types/ball";

interface BagContextValue {
  bag: BagEntry[];
  savedArsenalId: string | null;
  addToBag: (ball: Ball, gameCount?: number) => void;
  addCustomToBag: (ball: CustomBall, gameCount?: number) => void;
  removeFromBag: (ballId: string) => void;
  setGameCount: (ballId: string, gameCount: number) => void;
  setBag: (entries: BagEntry[]) => void;
  setSavedArsenalId: (id: string | null) => void;
  arsenalBallIds: string[];
  gameCounts: Record<string, number>;
}

/**
 * Context for managing the user's bowling ball bag (arsenal) state.
 * 
 * Includes the current bag entries, the ID of the saved arsenal (if any), 
 * and functions to modify the bag.
 */
const BagContext = createContext<BagContextValue | null>(null);

/**
 * Provider component that maintains the bag state and provides it to the app.
 * 
 * Handles adding/removing balls, updating game counts for wear simulation, 
 * and exposing memoized helper values like `arsenalBallIds`.
 */
export function BagProvider({ children }: { children: ReactNode }) {
  const [bag, setBagState] = useState<BagEntry[]>([]);
  const [savedArsenalId, setSavedArsenalId] = useState<string | null>(null);

  const addToBag = useCallback((ball: Ball, gameCount = 0) => {
    setBagState((prev) => {
      if (prev.some((e) => e.ball.ball_id === ball.ball_id)) return prev;
      return [...prev, { type: "catalog", ball, game_count: gameCount }];
    });
  }, []);

  const addCustomToBag = useCallback((ball: CustomBall, gameCount = 0) => {
    setBagState((prev) => {
      if (prev.some((e) => e.ball.ball_id === ball.ball_id)) return prev;
      return [...prev, { type: "custom", ball, game_count: gameCount }];
    });
  }, []);

  const removeFromBag = useCallback((ballId: string) => {
    setBagState((prev) => prev.filter((e) => e.ball.ball_id !== ballId));
  }, []);

  const setGameCount = useCallback((ballId: string, gameCount: number) => {
    setBagState((prev) =>
      prev.map((e) =>
        e.ball.ball_id === ballId ? { ...e, game_count: gameCount } : e
      )
    );
  }, []);

  const setBag = useCallback((entries: BagEntry[]) => {
    setBagState(entries);
  }, []);

  const arsenalBallIds = useMemo(() => bag.map((e) => e.ball.ball_id), [bag]);
  const gameCounts = useMemo(
    () => Object.fromEntries(bag.map((e) => [e.ball.ball_id, e.game_count])),
    [bag]
  );

  const value = useMemo<BagContextValue>(
    () => ({
      bag,
      savedArsenalId,
      addToBag,
      addCustomToBag,
      removeFromBag,
      setGameCount,
      setBag,
      setSavedArsenalId,
      arsenalBallIds,
      gameCounts,
    }),
    [
      bag,
      savedArsenalId,
      addToBag,
      addCustomToBag,
      removeFromBag,
      setGameCount,
      setBag,
      arsenalBallIds,
      gameCounts,
    ]
  );

  return (
    <BagContext.Provider value={value}>{children}</BagContext.Provider>
  );
}

/**
 * Hook to access the BagContext.
 * 
 * Must be used within a BagProvider.
 * 
 * @returns {BagContextValue} The current bag state and its modifiers.
 * @throws {Error} If used outside of a BagProvider.
 */
export function useBag() {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error("useBag must be used within BagProvider");
  return ctx;
}
