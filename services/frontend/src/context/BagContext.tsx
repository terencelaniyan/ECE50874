import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Ball } from "../types/ball";

export interface BagEntry {
  ball: Ball;
  game_count: number;
}

interface BagContextValue {
  bag: BagEntry[];
  savedArsenalId: string | null;
  addToBag: (ball: Ball, gameCount?: number) => void;
  removeFromBag: (ballId: string) => void;
  setGameCount: (ballId: string, gameCount: number) => void;
  setBag: (entries: BagEntry[]) => void;
  setSavedArsenalId: (id: string | null) => void;
  arsenalBallIds: string[];
  gameCounts: Record<string, number>;
}

const BagContext = createContext<BagContextValue | null>(null);

export function BagProvider({ children }: { children: ReactNode }) {
  const [bag, setBagState] = useState<BagEntry[]>([]);
  const [savedArsenalId, setSavedArsenalId] = useState<string | null>(null);

  const addToBag = useCallback((ball: Ball, gameCount = 0) => {
    setBagState((prev) => {
      if (prev.some((e) => e.ball.ball_id === ball.ball_id)) return prev;
      return [...prev, { ball, game_count: gameCount }];
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

export function useBag() {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error("useBag must be used within BagProvider");
  return ctx;
}
