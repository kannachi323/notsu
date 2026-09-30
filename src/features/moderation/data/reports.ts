import { accountClient, AccountError, authError, configuration } from "../../accounts/data/auth";
import { useAccountStore } from "../../accounts/accountStore";
import { parseConnectionCursor, parsePlayerId, type ConnectionCursor } from "../../friends/domain/connections";
import { moderationAccess, reportContext, reportDetail, reportInput, reportPage, reportReceipt, reviewInput, type ReportInput, type ReviewInput } from "../domain/reports";

async function request(path: string, value?: unknown, signal?: AbortSignal): Promise<unknown> {
  if (!configuration) throw new AccountError("Reporting is unavailable in this build.");
  const identity = useAccountStore.getState().identity;
  const { data, error } = await accountClient().auth.getSession();
  if (error) throw authError(error);
  const current = () => !!identity && identity.id === data.session?.user.id && identity.id === useAccountStore.getState().identity?.id;
  if (!current()) throw new AccountError("Sign in again to manage reports.");
  let response: Response;
  try {
    response = await fetch(`${configuration.apiUrl}/v1/me/${path}`, { method: value ? "PUT" : "GET", credentials: "omit", cache: "no-store",
      headers: { Authorization: `Bearer ${data.session!.access_token}`, ...(value ? { "Content-Type": "application/json" } : {}) },
      body: value ? JSON.stringify(value) : undefined, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
  } catch { throw new AccountError(value ? "The request could not be confirmed. Retry the same request to avoid duplicates." : "Reports could not load. Check your connection and retry."); }
  if (!current()) throw new AccountError("Your account changed. Sign in again.");
  let body: unknown;
  try { body = await response.json(); } catch { throw new AccountError("The report response could not be read."); }
  if (!current()) throw new AccountError("Your account changed. Sign in again.");
  if (!response.ok) {
    const code = (body as { error?: { code?: unknown } })?.error?.code;
    const messages: Record<string, string> = {
      profile_required: "Create your profile before submitting a report.", access_denied: "This account cannot access this moderation request.",
      report_unavailable: "This report or its evidence is unavailable.", report_conflict: "This request ID was already used. Refresh before trying again.",
      report_changed: "Another review changed this report. Refresh before deciding.", profile_changed: "The profile changed after this report. Refresh and review its current content.",
      protected_target: "This target requires an operator review.", restriction_exists: "This player already has an active restriction.",
      report_rate_limited: "You can submit ten reports per day. You can still block the player separately.",
      block_limit: "Your block list is full. Submit without blocking or manage your block list.", sign_in_required: "Sign in again to manage reports.",
    };
    throw new AccountError(typeof code === "string" && Object.hasOwn(messages, code) ? messages[code] : "This report request could not be completed.", typeof code === "string" ? code : "unavailable");
  }
  return body;
}
export async function loadModerationAccess(signal?: AbortSignal) { return moderationAccess(await request("moderation/access", undefined, signal)); }
export async function loadReportContext(target: string, messageId: string | null, signal?: AbortSignal) {
  const targetId = parsePlayerId(target), message = messageId === null ? null : parsePlayerId(messageId);
  const result = reportContext(await request(`reports/context?target=${targetId}${message ? `&message=${message}` : ""}`, undefined, signal));
  if (result.targetId !== targetId || (result.message?.id ?? null) !== message) throw new AccountError("Report evidence did not match this request.");
  return result;
}
export async function submitReport(value: ReportInput) {
  const input = reportInput(value), result = reportReceipt(await request("reports", input));
  if (result.id !== input.id || result.reason !== input.reason || result.kind !== (input.messageId ? "message" : "profile")) throw new AccountError("Report receipt did not match this request.");
  return result;
}
export async function loadReports(queue: "own" | "open" | "reviewed", before?: ConnectionCursor | null, signal?: AbortSignal) {
  const params = new URLSearchParams(), cursor = parseConnectionCursor(before?.time, before?.id);
  if (queue !== "own") params.set("status", queue);
  if (cursor) { params.set("beforeTime", cursor.time); params.set("beforeId", cursor.id); }
  return reportPage(await request(`${queue === "own" ? "reports" : "moderation/reports"}?${params}`, undefined, signal));
}
export async function loadReport(id: string, signal?: AbortSignal) {
  const reportId = parsePlayerId(id), result = reportDetail(await request(`moderation/reports/${reportId}`, undefined, signal));
  if (result.id !== reportId) throw new AccountError("This review does not match the report.");
  return result;
}
export async function reviewReport(id: string, value: ReviewInput) {
  const reportId = parsePlayerId(id), input = reviewInput(value), result = reportDetail(await request(`moderation/reports/${reportId}`, input));
  if (result.id !== reportId || !result.actions.some(action => action.id === input.id && action.action === input.action && action.note === input.note)) throw new AccountError("This decision receipt could not be confirmed.");
  return result;
}
