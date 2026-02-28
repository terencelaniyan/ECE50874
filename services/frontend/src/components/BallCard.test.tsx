import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BallCard } from "./BallCard";
import { minimalBall } from "../test/fixtures";

describe("BallCard", () => {
  it("renders ball name, brand, and specs", () => {
    render(
      <BallCard ball={minimalBall} onAddToBag={() => {}} inBag={false} />
    );
    expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    expect(screen.getByText(minimalBall.brand)).toBeInTheDocument();
    expect(screen.getByText("RG")).toBeInTheDocument();
    expect(screen.getByText(String(minimalBall.rg))).toBeInTheDocument();
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText(String(minimalBall.diff))).toBeInTheDocument();
    expect(screen.getByText("Int diff")).toBeInTheDocument();
    expect(screen.getByText(String(minimalBall.int_diff))).toBeInTheDocument();
  });

  it("renders coverstock_type when present", () => {
    render(
      <BallCard ball={minimalBall} onAddToBag={() => {}} inBag={false} />
    );
    expect(screen.getByText(minimalBall.coverstock_type!)).toBeInTheDocument();
  });

  it("shows Add to bag button when not in bag and calls onAddToBag on click", () => {
    const onAddToBag = vi.fn();
    render(
      <BallCard ball={minimalBall} onAddToBag={onAddToBag} inBag={false} />
    );
    const btn = screen.getByRole("button", { name: /add to bag/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAddToBag).toHaveBeenCalledTimes(1);
  });

  it("shows In bag button disabled when in bag", () => {
    render(
      <BallCard ball={minimalBall} onAddToBag={() => {}} inBag={true} />
    );
    const btn = screen.getByRole("button", { name: /in bag/i });
    expect(btn).toBeDisabled();
  });
});
