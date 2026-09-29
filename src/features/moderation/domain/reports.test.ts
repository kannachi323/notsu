import { describe, expect, it } from "vitest";
import { moderationAccess, reportContext, reportDetail, reportInput, reportPage, reportReceipt, reviewInput } from "./reports";
const id = "11111111-1111-4111-8111-111111111111", target = "22222222-2222-4222-8222-222222222222", at = "2026-09-29T01:02:03.123456Z";
const input = { id, targetId: target, messageId: null, reason: "other", details: "A real concern", block: false };
const receipt = { id, kind: "profile", targetName: "Player", reason: "other", status: "open", createdAt: at, reviewedAt: null };
const context = { kind: "profile", targetId: target, username: "player_two", displayName: "Player", bio: "", message: null };
describe("report contracts", () => {
  it("rejects client evidence, identity and severity fields", () => {
    expect(reportInput(input)).toEqual(input);
    for (const extra of [{ evidence: "fake" }, { reporterId: target }, { status: "action_taken" }, { severity: 10 }]) expect(() => reportInput({ ...input, ...extra })).toThrow();
  });
  it("bounds Unicode details and blocks control characters", () => {
    expect(reportInput({ ...input, details: "🎵".repeat(2000) }).details).toHaveLength(4000);
    for (const details of [" ", "x".repeat(2001), "hidden\u0000text", "hidden\u0085text"]) expect(() => reportInput({ ...input, details })).toThrow();
  });
  it("requires a known decision, revision and a bounded single-line explanation", () => {
    expect(reviewInput({ id, revision: target, action: "dismiss", note: "Reviewed" }).action).toBe("dismiss");
    for (const patch of [{ action: "ban_forever" }, { revision: null }, { note: "line\nbreak" }, { note: "x".repeat(501) }, { moderatorId: id }]) expect(() => reviewInput({ id, revision: target, action: "dismiss", note: "Reviewed", ...patch })).toThrow();
  });
  it("strips private fields from reporter receipts and requires matching evidence type", () => {
    expect(reportReceipt({ ...receipt, details: "private", reporterId: target })).toEqual(receipt);
    expect(reportContext(context)).toEqual(context);
    expect(() => reportContext({ ...context, kind: "message" })).toThrow();
    expect(() => reportContext({ ...context, message: { id, body: "private", createdAt: at } })).toThrow();
  });
  it("rejects invented roles, invalid restrictions and mismatched page cursors", () => {
    expect(moderationAccess({ moderator: false, restriction: null })).toEqual({ moderator: false, restriction: null });
    expect(() => moderationAccess({ moderator: "true", restriction: null })).toThrow();
    expect(() => moderationAccess({ moderator: false, restriction: { until: "later", note: "test" } })).toThrow();
    expect(() => reportPage({ items: [receipt], next: { id, time: at } })).toThrow();
    expect(() => reportPage({ items: [receipt, receipt], next: null })).toThrow();
  });
  it("bounds review history and validates nullable identities after deletion", () => {
    const detail = { ...receipt, revision: target, evidence: context, details: "test", reporterId: null, targetId: null, decision: null, decisionNote: null, restriction: null, actions: [] };
    expect(reportDetail(detail).targetId).toBeNull();
    expect(() => reportDetail({ ...detail, actions: Array(3).fill({}) })).toThrow();
    expect(() => reportDetail({ ...detail, restriction: { until: at, note: "test" } })).toThrow();
  });
});
