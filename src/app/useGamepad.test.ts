import { expect, it } from "vitest";
import { buttonEdges } from "./useGamepad";

it("reports only buttons that changed since the previous poll", () => {
  expect(buttonEdges([], [true, false, true])).toEqual({ pressed: [0, 2], released: [] });
  expect(buttonEdges([true, false, true], [true, true, false])).toEqual({ pressed: [1], released: [2] });
  expect(buttonEdges([true], [true])).toEqual({ pressed: [], released: [] });
});
