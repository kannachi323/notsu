import { Hono } from "hono";
import type { SessionEnv } from "../accounts/data/session";
import { ApiError } from "../../errors";
import { readJsonBody } from "../../shared/data/requestBody";
import { unavailable } from "../accounts/data/supabase";
import { parseConnectionCursor, parsePlayerId } from "../../../src/features/friends/domain/connections";
import { moderationAccess, reportContext, reportDetail, reportInput, reportReceipt, reviewInput } from "../../../src/features/moderation/domain/reports";

export const moderation = new Hono<SessionEnv>();
function input<T>(parse: () => T): T { try { return parse(); } catch { throw new ApiError(400, "invalid_report", "Check the report details."); } }
function failure(error: { code?: string; message?: string }) {
  if (error.code === "42501") return new ApiError(403, "access_denied", "This account cannot access this moderation request.");
  if (["22023", "22P02", "22007", "22008"].includes(error.code ?? "")) return new ApiError(400, "invalid_report", "Check the report details.");
  const cases: Record<string, [400 | 403 | 409 | 429, string]> = {
    profile_required: [400, "Create your profile before submitting a report."], report_unavailable: [403, "This report or its evidence is unavailable."],
    report_conflict: [409, "This request ID was already used. Refresh before trying again."], report_changed: [409, "Another review changed this report. Refresh before deciding."],
    profile_changed: [409, "The profile changed after this report. Review the current profile before taking action."],
    protected_target: [403, "This target requires an operator review."], restriction_exists: [409, "This player already has a restriction. Review that decision first."],
    report_rate_limited: [429, "You can submit ten reports per day. Blocking remains available."], block_limit: [409, "Your block list is full. Submit without blocking or manage your block list."],
  };
  const match = error.code === "P0001" && Object.hasOwn(cases, error.message ?? "") ? cases[error.message!] : undefined;
  return match ? new ApiError(match[0], error.message!, match[1]) : unavailable();
}
async function rpc(db: SessionEnv["Variables"]["db"], name: string, args?: Record<string, unknown>) {
  const result = await db.rpc(name, args); if (result.error) throw failure(result.error); return result.data;
}
async function json(request: Request, max = 4096) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "json_required", "Send report details as JSON.");
  return readJsonBody(request, max);
}
moderation.get("/me/moderation/access", async c => c.json(moderationAccess(await rpc(c.get("db"), "moderation_access"))));
moderation.get("/me/reports/context", async c => {
  const target = input(() => parsePlayerId(c.req.query("target"))), message = c.req.query("message");
  return c.json(reportContext(await rpc(c.get("db"), "report_context", { p_target: target, p_message: message ? input(() => parsePlayerId(message)) : null })));
});
moderation.put("/me/reports", async c => {
  const body = await json(c.req.raw, 16384), value = input(() => reportInput(body));
  return c.json(reportReceipt(await rpc(c.get("db"), "submit_report", { p_id: value.id, p_target: value.targetId, p_message: value.messageId, p_reason: value.reason, p_details: value.details, p_block: value.block })));
});
for (const [path, name] of [["/me/reports", "list_own_reports"], ["/me/moderation/reports", "moderation_queue"]] as const) {
  moderation.get(path, async c => {
    const cursor = input(() => parseConnectionCursor(c.req.query("beforeTime"), c.req.query("beforeId")));
    const status = c.req.query("status") ?? "open";
    if (name === "moderation_queue" && !["open", "reviewed"].includes(status)) throw new ApiError(400, "invalid_report", "Choose a queue.");
    const rows = await rpc(c.get("db"), name, { p_before_time: cursor?.time ?? null, p_before_id: cursor?.id ?? null, ...(name === "moderation_queue" ? { p_status: status } : {}) });
    if (!Array.isArray(rows) || rows.length > 51) throw unavailable();
    const items = rows.slice(0, 50).map(reportReceipt), last = items.at(-1);
    return c.json({ items, next: rows.length > 50 && last ? { time: last.createdAt, id: last.id } : null });
  });
}
moderation.get("/me/moderation/reports/:id", async c => c.json(reportDetail(await rpc(c.get("db"), "moderation_report", { p_id: input(() => parsePlayerId(c.req.param("id"))) }))));
moderation.put("/me/moderation/reports/:id", async c => {
  const id = input(() => parsePlayerId(c.req.param("id"))), raw = await json(c.req.raw), body = input(() => reviewInput(raw));
  return c.json(reportDetail(await rpc(c.get("db"), "review_report", { p_id: id, p_revision: body.revision, p_action_id: body.id, p_action: body.action, p_note: body.note })));
});
