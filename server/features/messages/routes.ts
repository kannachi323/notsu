import { Hono } from "hono";
import type { SessionEnv } from "../accounts/data/session";
import { ApiError } from "../../errors";
import { unavailable } from "../accounts/data/supabase";
import { readJsonBody } from "../../shared/data/requestBody";
import { messageInput, parseConversation, parseMessage, sequence } from "../../../src/features/messages/domain/messages";
import { parseConnectionCursor, parsePlayerId } from "../../../src/features/friends/domain/connections";

export const messages=new Hono<SessionEnv>();
function input<T>(parse:()=>T):T { try { return parse(); } catch { throw new ApiError(400,"invalid_message","Check the message and conversation details."); } }
function failure(error:{code?:string;message?:string}) {
  if (error.code==="42501") return new ApiError(403,"account_unavailable","Sign in again to read your messages.");
  if (["22023","22P02","22007","22008","22003"].includes(error.code??"")) return new ApiError(400,"invalid_message","Check the message details.");
  if (error.code==="P0001") {
    if (error.message==="conversation_unavailable") return new ApiError(403,error.message,"This conversation is unavailable. Messages are for accepted friends.");
    if (error.message==="message_conflict") return new ApiError(409,error.message,"This message ID was already used for different content.");
    if (error.message==="message_rate_limited") return new ApiError(429,error.message,"You have reached a message limit. Try again later.");
  }
  return unavailable();
}
messages.get("/me/conversations",async c=>{
  const cursor=input(()=>parseConnectionCursor(c.req.query("beforeTime"),c.req.query("beforeId")));
  const {data,error}=await c.get("db").rpc("list_conversations",{p_before_time:cursor?.time??null,p_before_id:cursor?.id??null});
  if (error) throw failure(error);
  if (!Array.isArray(data) || data.length>51) throw unavailable();
  const items=data.slice(0,50).map(row=>parseConversation({userId:row.user_id,username:row.username,displayName:row.display_name,preview:row.preview,updatedAt:row.updated_at,unread:row.unread}));
  const last=items.at(-1);
  return c.json({items,next:data.length>50 && last?{time:last.updatedAt,id:last.userId}:null});
});
messages.get("/me/messages/:target",async c=>{
  const target=input(()=>parsePlayerId(c.req.param("target"))), before=c.req.query("before");
  const {data,error}=await c.get("db").rpc("list_messages",{p_target:target,p_before:before===undefined?null:input(()=>sequence(before))});
  if (error) throw failure(error);
  if (!Array.isArray(data)||data.length>51) throw unavailable();
  const items=data.slice(0,50).map(row=>parseMessage({id:row.id,senderId:row.sender_id,sequence:row.sequence,body:row.body,createdAt:row.created_at}));
  return c.json({items,next:data.length>50?items.at(-1)!.sequence:null});
});
messages.put("/me/messages/:target",async c=>{
  const target=input(()=>parsePlayerId(c.req.param("target")));
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase()!=="application/json") throw new ApiError(415,"json_required","Send messages as JSON.");
  const raw=await readJsonBody(c.req.raw,16384), body=input(()=>messageInput(raw));
  const {data,error}=await c.get("db").rpc("send_message",{p_target:target,p_id:body.id,p_body:body.body});
  if (error) throw failure(error);
  return c.json({message:parseMessage(data)});
});
messages.put("/me/messages/:target/read",async c=>{
  const target=input(()=>parsePlayerId(c.req.param("target")));
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase()!=="application/json") throw new ApiError(415,"json_required","Send the read position as JSON.");
  const raw=await readJsonBody(c.req.raw);
  const position=input(()=>{
    if (!raw || typeof raw!=="object" || Array.isArray(raw) || Object.keys(raw).length!==1 || !("sequence" in raw)) throw new Error();
    return sequence(raw.sequence);
  });
  const {error}=await c.get("db").rpc("mark_messages_read",{p_target:target,p_sequence:position});
  if (error) throw failure(error);
  return c.json({ok:true});
});
