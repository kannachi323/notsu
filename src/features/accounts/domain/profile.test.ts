import { describe, expect, it } from "vitest";
import { parseProfileInput, parseUsername } from "./profile";

const input = { username: "Player_1", displayName: " Player 🎵 ", bio: " My maps\nMy music " };

describe("profile details", () => {
  it("normalizes handles and trims text while preserving ordinary line breaks", () => {
    expect(parseProfileInput(input)).toEqual({
      username: "player_1", displayName: "Player 🎵", bio: "My maps\nMy music",
    });
  });
  it("counts Unicode characters rather than UTF-16 halves", () => {
    expect(parseProfileInput({ ...input, displayName: "🎵".repeat(40) }).displayName).toHaveLength(80);
    expect(() => parseProfileInput({ ...input, displayName: "🎵".repeat(41) })).toThrow();
    expect(parseProfileInput({ ...input, bio: "🎵".repeat(280) }).bio).toHaveLength(560);
    expect(() => parseProfileInput({ ...input, bio: "🎵".repeat(281) })).toThrow();
  });
  it.each(["ab", "1abc", "ab-c", "a b", "a".repeat(21), "héro", "a/b", "admin?", null])(
    "rejects invalid username %s", (value) => expect(() => parseUsername(value)).toThrow(),
  );
  it.each([null, [], {}, { ...input, id: "someone-else" }, { ...input, role: "admin" },
    { ...input, rating: 100 }, { ...input, bio: 4 }, { ...input, displayName: " " },
    { ...input, displayName: "A\nB" }, { ...input, bio: "A\u0000B" },
    { ...input, bio: "A\u0085B" }, { ...input, bio: "A\tB" }])(
    "rejects malformed or privileged profile details %s", (value) => {
      expect(() => parseProfileInput(value)).toThrow();
    },
  );
});
