import { parseConnectionCursor, parsePlayerId, type ConnectionCursor } from "../../friends/domain/connections";
import { parseUsername } from "../../accounts/domain/profile";

export const reasons = ["spam", "harassment", "inappropriate_content", "impersonation", "cheating", "other"] as const;
export type ReportReason = typeof reasons[number];
export const reasonLabels: Record<ReportReason, string> = { spam: "Spam", harassment: "Harassment", inappropriate_content: "Inappropriate content", impersonation: "Impersonation", cheating: "Suspected cheating", other: "Other concern" };
export const actions = ["dismiss", "clear_profile", "restrict_7d", "restrict_30d", "lift_restriction"] as const;
export type ReviewAction = typeof actions[number];
export const actionLabels: Record<ReviewAction, string> = { dismiss: "Close without action", clear_profile: "Clear profile content", restrict_7d: "Restrict community access for 7 days", restrict_30d: "Restrict community access for 30 days", lift_restriction: "Lift this restriction" };
export interface ReportInput { id: string; targetId: string; messageId: string | null; reason: ReportReason; details: string; block: boolean }
export interface ReviewInput { id: string; revision: string; action: ReviewAction; note: string }
export interface ReportReceipt { id: string; kind: "profile" | "message"; targetName: string; reason: ReportReason; status: "open" | "dismissed" | "action_taken"; createdAt: string; reviewedAt: string | null }
export interface ReportContext { kind: "profile" | "message"; targetId: string; username: string | null; displayName: string; bio: string; message: { id: string; body: string; createdAt: string } | null }
export interface Restriction { until: string; note: string }
export interface ModerationAccess { moderator: boolean; restriction: Restriction | null }
export interface ReportDetail extends ReportReceipt { revision: string; evidence: ReportContext; details: string; reporterId: string | null; targetId: string | null; decision: ReviewAction | null; decisionNote: string | null; restriction: (Restriction & { thisReport: boolean }) | null; actions: Array<{ id: string; action: ReviewAction; note: string; moderatorId: string | null; createdAt: string }> }
export interface ReportPage { items: ReportReceipt[]; next: ConnectionCursor | null }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unreadable report details.");
  return value as Record<string, unknown>;
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error("Choose a valid report option.");
  return value as T;
}
function text(value: unknown, max: number, blank = false): string {
  if (typeof value !== "string" || (!blank && !value.trim()) || [...value].length > max || new TextEncoder().encode(value).length > max * 4 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(value)) throw new Error(`Use ${blank ? "up to" : "1–"} ${max} characters without control characters.`);
  return value;
}
function date(value: unknown): string {
  const cursor = parseConnectionCursor(value, "00000000-0000-0000-0000-000000000000");
  if (!cursor) throw new Error("Missing report date.");
  return cursor.time;
}
const nullableId = (value: unknown) => value === null ? null : parsePlayerId(value);
const nullableDate = (value: unknown) => value === null ? null : date(value);
export function reportInput(value: unknown): ReportInput {
  const row = object(value);
  if (Object.keys(row).some(key => !["id", "targetId", "messageId", "reason", "details", "block"].includes(key)) || typeof row.block !== "boolean") throw new Error("Unexpected report details.");
  return { id: parsePlayerId(row.id), targetId: parsePlayerId(row.targetId), messageId: nullableId(row.messageId), reason: oneOf(row.reason, reasons), details: text(row.details, 2000), block: row.block };
}
export function reviewInput(value: unknown): ReviewInput {
  const row = object(value), note = text(row.note, 500);
  if (Object.keys(row).some(key => !["id", "revision", "action", "note"].includes(key)) || /[\r\n\t]/.test(note)) throw new Error("Write a single-line review explanation.");
  return { id: parsePlayerId(row.id), revision: parsePlayerId(row.revision), action: oneOf(row.action, actions), note };
}
export function reportReceipt(value: unknown): ReportReceipt {
  const row = object(value);
  return { id: parsePlayerId(row.id), kind: oneOf(row.kind, ["profile", "message"]), targetName: text(row.targetName, 40), reason: oneOf(row.reason, reasons),
    status: oneOf(row.status, ["open", "dismissed", "action_taken"]), createdAt: date(row.createdAt), reviewedAt: nullableDate(row.reviewedAt) };
}
export function reportContext(value: unknown): ReportContext {
  const row = object(value), kind = oneOf(row.kind, ["profile", "message"]);
  const message = row.message === null ? null : object(row.message);
  if ((kind === "profile") !== (message === null)) throw new Error("Report evidence did not match its type.");
  return { kind, targetId: parsePlayerId(row.targetId), username: row.username === null ? null : parseUsername(row.username), displayName: text(row.displayName, 40), bio: text(row.bio, 280, true),
    message: message && { id: parsePlayerId(message.id), body: text(message.body, 2000), createdAt: date(message.createdAt) } };
}
function restriction(value: unknown): Restriction | null {
  if (value === null) return null;
  const row = object(value); return { until: date(row.until), note: text(row.note, 500) };
}
export function moderationAccess(value: unknown): ModerationAccess {
  const row = object(value);
  if (typeof row.moderator !== "boolean") throw new Error("Access could not be confirmed.");
  return { moderator: row.moderator, restriction: restriction(row.restriction) };
}
export function reportDetail(value: unknown): ReportDetail {
  const row = object(value), restricted = restriction(row.restriction);
  if (!Array.isArray(row.actions) || row.actions.length > 2) throw new Error("Unreadable review history.");
  if (restricted && typeof object(row.restriction).thisReport !== "boolean") throw new Error("Unreadable restriction.");
  return { ...reportReceipt(row), revision: parsePlayerId(row.revision), evidence: reportContext(row.evidence), details: text(row.details, 2000),
    reporterId: nullableId(row.reporterId), targetId: nullableId(row.targetId), decision: row.decision === null ? null : oneOf(row.decision, actions),
    decisionNote: row.decisionNote === null ? null : text(row.decisionNote, 500),
    restriction: restricted && { ...restricted, thisReport: object(row.restriction).thisReport as boolean },
    actions: row.actions.map(value => { const action = object(value); return { id: parsePlayerId(action.id), action: oneOf(action.action, actions), note: text(action.note, 500), moderatorId: nullableId(action.moderatorId), createdAt: date(action.createdAt) }; }) };
}
export function reportPage(value: unknown): ReportPage {
  const row = object(value);
  if (!Array.isArray(row.items) || row.items.length > 50 || !("next" in row)) throw new Error("Unreadable report list.");
  const items = row.items.map(reportReceipt), last = items.at(-1);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Duplicate report rows.");
  const next = row.next === null ? null : parseConnectionCursor(object(row.next).time, object(row.next).id);
  if (row.next !== null && (!next || items.length !== 50 || last?.id !== next.id || last.createdAt !== next.time)) throw new Error("Unreadable next report page.");
  return { items, next };
}
