import { accountClient, AccountError, authError, configuration } from "../../accounts/data/auth";
import { useAccountStore } from "../../accounts/accountStore";
import { parseConnectionCursor, parsePlayerId, type ConnectionCursor } from "../../friends/domain/connections";
import { messageInput, parseMessage, parseConversation, sequence, type MessageInput, type MessagePage, type InboxPage } from "../domain/messages";

async function request(path:string,body?:unknown,signal?:AbortSignal):Promise<unknown> {
  if (!configuration) throw new AccountError("Messages are unavailable in this build.");
  const identity=useAccountStore.getState().identity;
  const {data,error}=await accountClient().auth.getSession();
  if (error) throw authError(error);
  const current=()=>!!identity && identity.id===useAccountStore.getState().identity?.id && identity.id===data.session?.user.id;
  if (!current()) throw new AccountError("Sign in again to read your messages.","sign_in_required");
  let response:Response;
  try {
    response=await fetch(`${configuration.apiUrl}/v1/me/${path}`,{method:body?"PUT":"GET",credentials:"omit",cache:"no-store",
      headers:{Authorization:`Bearer ${data.session!.access_token}`,...(body?{"Content-Type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  } catch { throw new AccountError(body?"Delivery could not be confirmed. Retry the same message to check safely.":"Could not load messages. Check your connection and retry."); }
  if (!current()) throw new AccountError("Your account changed. Sign in again.");
  let value:unknown;
  try { value=await response.json(); } catch { throw new AccountError("The message service returned an unreadable response."); }
  if (!current()) throw new AccountError("Your account changed. Sign in again.");
  if (!response.ok) {
    const code=(value as {error?:{code?:unknown}})?.error?.code;
    const labels:Record<string,string>={conversation_unavailable:"This conversation is unavailable. Messages are for accepted friends.",
      message_conflict:"This message ID was already used. Refresh the conversation before trying again.",message_rate_limited:"You have reached a message limit. Please try again later.",
      account_unavailable:"Your session has ended. Sign out and sign in again.",sign_in_required:"Sign in again to read your messages."};
    throw new AccountError(typeof code==="string" && Object.hasOwn(labels,code)?labels[code]:"The message service could not complete this request.",typeof code==="string"?code:"unavailable");
  }
  return value;
}
export async function sendMessage(target:string,value:MessageInput) {
  const body=messageInput(value), result=await request(`messages/${parsePlayerId(target)}`,body) as {message?:unknown};
  const message=parseMessage(result?.message);
  if (message.id!==body.id || message.body!==body.body || message.senderId!==useAccountStore.getState().identity?.id) throw new AccountError("The message receipt did not match. Retry the same message safely.");
  return message;
}
export async function loadMessages(target:string,before:string|null=null,signal?:AbortSignal):Promise<MessagePage> {
  const peer=parsePlayerId(target),result=await request(`messages/${peer}${before?`?before=${sequence(before)}`:""}`,undefined,signal) as MessagePage;
  if (!Array.isArray(result?.items)||result.items.length>50) throw new AccountError("Unreadable conversation.");
  const items=result.items.map(parseMessage),actor=useAccountStore.getState().identity?.id;
  if (items.some((item,index)=>![peer,actor].includes(item.senderId) || (index>0 && BigInt(item.sequence)>=BigInt(items[index-1].sequence)) || (before && BigInt(item.sequence)>=BigInt(before)))) throw new AccountError("Inconsistent conversation. Please refresh.");
  const next=result.next===null?null:sequence(result.next);
  if (next && (items.length!==50 || next!==items.at(-1)?.sequence)) throw new AccountError("Unreadable message position.");
  return {items,next};
}
export async function loadInbox(before:ConnectionCursor|null=null,signal?:AbortSignal):Promise<InboxPage> {
  const params=new URLSearchParams(),cursor=parseConnectionCursor(before?.time,before?.id);
  if(cursor){params.set("beforeTime",cursor.time);params.set("beforeId",cursor.id);}
  const result=await request(`conversations?${params}`,undefined,signal) as InboxPage;
  if (!Array.isArray(result?.items)||result.items.length>50) throw new AccountError("Unreadable inbox.");
  const items=result.items.map(parseConversation),next=result.next===null?null:parseConnectionCursor(result.next?.time,result.next?.id);
  if(new Set(items.map(item=>item.userId)).size!==items.length || (result.next!==null && (!next || items.length!==50 || next.id!==items.at(-1)?.userId || next.time!==items.at(-1)?.updatedAt))) throw new AccountError("Inconsistent inbox. Please refresh.");
  return {items,next};
}
export async function markRead(target:string,position:string) { await request(`messages/${parsePlayerId(target)}/read`,{sequence:sequence(position)}); }
