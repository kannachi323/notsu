import { describe, expect, it } from "vitest";
import { friendPresence, isOnline, ownPresence, presenceInput, presenceTargets, snapshot, visibilityInput } from "./presence";
const id = "11111111-1111-4111-8111-111111111111";

describe("presence boundaries and expiry", () => {
  it("accepts only visibility and ordered client updates, never caller ownership or time", () => {
    expect(visibilityInput({ visibility: "hidden" })).toBe("hidden");
    expect(presenceInput({ clientId: id, sequence: 1, visible: true })).toEqual({ clientId: id, sequence: 1, visible: true });
    for (const value of [{ visibility: "everyone" }, { visibility: "friends", userId: id }]) expect(() => visibilityInput(value)).toThrow();
    for (const patch of [{ sequence: 0 }, { sequence: 1.5 }, { sequence: 2147483648 }, { visible: "true" }, { userId: id }, { expiresAt: 90000 }]) expect(() => presenceInput({ clientId: id, sequence: 1, visible: true, ...patch })).toThrow();
  });
  it("rejects duplicate, missing and oversized target batches", () => {
    expect(presenceTargets([id])).toEqual([id]);
    for (const value of [[], [id, id], [null], Array(51).fill(id)]) expect(() => presenceTargets(value)).toThrow();
  });
  it("cannot represent hidden or offline players with a live lease", () => {
    for (const value of [{ visibility: "hidden", validForMs: 1 }, { visibility: "friends", validForMs: 90001 }, { visibility: "friends", validForMs: NaN }]) expect(() => ownPresence(value)).toThrow();
    for (const value of [{ userId: id, online: false, validForMs: 5000 }, { userId: id, online: true, validForMs: 0 }]) expect(() => friendPresence(value)).toThrow();
  });
  it("subtracts request latency and expires without a server notification or wall clock", () => {
    const [row] = snapshot([{ userId: id, online: true, validForMs: 5000 }], 1000, 4000);
    expect(row.onlineUntil).toBe(6000);
    expect(isOnline(row, 5999)).toBe(true); expect(isOnline(row, 6000)).toBe(false);
    expect(isOnline(undefined, 6000)).toBe(null);
    const [delayed] = snapshot([{ userId: id, online: true, validForMs: 5000 }], 1000, 9000);
    expect(isOnline(delayed, 9000)).toBe(false);
  });
});
