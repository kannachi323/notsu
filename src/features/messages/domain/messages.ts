import { parseConnectionCursor, parsePlayerId, type ConnectionCursor } from "../../friends/domain/connections";
import { parseProfileInput } from "../../accounts/domain/profile";

export interface Message { id: string; senderId: string; sequence: string; body: string; createdAt: string }
export interface MessageInput { id: string; body: string }
export interface Conversation { userId: string; username: string; displayName: string; preview: string | null; updatedAt: string; unread: number }
export interface MessagePage { items: Message[]; next: string | null }
export interface InboxPage { items: Conversation[]; next: ConnectionCursor | null }

export function sequence(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value)>9223372036854775807n) throw new Error("Invalid message position.");
  return value;
}
export function messageText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || [...value].length>2000 || new TextEncoder().encode(value).length>8000 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(value)) throw new Error("Write a message of 1–2,000 characters without control characters.");
  return value;
}
function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Unreadable message details.");
  return value as Record<string,unknown>;
}
export function messageInput(value: unknown): MessageInput {
  const row=record(value);
  if (Object.keys(row).some(key=>!["id","body"].includes(key))) throw new Error("Unexpected message details.");
  return { id:parsePlayerId(row.id), body:messageText(row.body) };
}
export function parseMessage(value: unknown): Message {
  const row=record(value), id=parsePlayerId(row.id), time=parseConnectionCursor(row.createdAt,id);
  if (!time) throw new Error("Missing message date.");
  return { id, senderId:parsePlayerId(row.senderId), sequence:sequence(row.sequence), body:messageText(row.body), createdAt:time.time };
}
export function parseConversation(value: unknown): Conversation {
  const row=record(value), userId=parsePlayerId(row.userId), time=parseConnectionCursor(row.updatedAt,userId);
  const profile=parseProfileInput({username:row.username,displayName:row.displayName,bio:""});
  if (!time || !(row.preview===null || (typeof row.preview==="string" && [...row.preview].length<=100)) || !Number.isInteger(row.unread) || Number(row.unread)<0 || Number(row.unread)>100) throw new Error("Unreadable conversation.");
  return { userId, username:profile.username, displayName:profile.displayName, preview:row.preview as string|null, updatedAt:time.time, unread:Number(row.unread) };
}

/** Keep a contiguous range. After a large reconnect gap, offer earlier paging. */
export function mergeMessagePage(old:MessagePage,page:MessagePage,older:boolean):MessagePage {
  const overlaps=old.items.length>0 && page.items.some(item=>item.sequence===old.items[0].sequence);
  if(!older&&!overlaps)return page;
  return {items:[...new Map([...old.items,...page.items].map(item=>[item.sequence,item])).values()].sort((a,b)=>BigInt(a.sequence)>BigInt(b.sequence)?-1:1),next:older?page.next:old.next};
}
