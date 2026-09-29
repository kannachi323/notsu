import { describe, expect, it } from "vitest";
import { emailAddress, emailCode, newPassword } from "./credentials";

describe("account input", () => {
  it("trims email/code but preserves password characters", () => {
    expect(emailAddress(" player@example.test ")).toBe("player@example.test");
    expect(emailCode(" 001234 ")).toBe("001234");
    expect(newPassword(" a long passphrase ", " a long passphrase ")).toBe(" a long passphrase ");
  });
  it.each(["", "no-domain", "two@@example.test", "space @example.test", "a".repeat(250) + "@a.test"])("rejects invalid email %s", input => expect(() => emailAddress(input)).toThrow());
  it.each(["12345", "1234567", "123 45", "12e456", "１２３４５６"])("rejects invalid OTP %s", input => expect(() => emailCode(input)).toThrow());
  it("requires matching 12–128 character passwords", () => {
    expect(() => newPassword("short", "short")).toThrow();
    expect(() => newPassword("a".repeat(129), "a".repeat(129))).toThrow();
    expect(() => newPassword("a".repeat(12), "b".repeat(12))).toThrow();
    expect(newPassword("a".repeat(128), "a".repeat(128))).toHaveLength(128);
  });
});
