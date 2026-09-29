import { describe, expect, it } from "vitest";
import { parseConnection, parseConnectionChange, parseConnectionCursor, parseConnectionItem, parseConnectionList, parsePlayerId } from "./connections";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("connection input boundaries", () => {
  it("accepts UUID targets without allowing path or owner injection", () => {
    expect(parsePlayerId(id.toUpperCase())).toBe(id);
    for (const value of [null, 42, "../me", `${id}/friends`, "", { id }]) expect(() => parsePlayerId(value)).toThrow();
    for (const value of [{ action: "send", owner: id }, { action: "accept", expectedId: id, userId: id }, ["send"], null, { action: "admin" }]) expect(() => parseConnectionChange(value)).toThrow();
  });
  it("requires generation IDs for actions on existing relationships", () => {
    for (const action of ["accept", "decline", "cancel", "remove", "unblock"]) {
      expect(parseConnectionChange({ action, expectedId: id })).toEqual({ action, expectedId: id });
      expect(() => parseConnectionChange({ action })).toThrow();
    }
    for (const action of ["send", "block"]) {
      expect(parseConnectionChange({ action })).toEqual({ action });
      expect(() => parseConnectionChange({ action, expectedId: id })).toThrow();
    }
  });
  it("keeps microseconds in pagination and rejects partial or unbounded cursors", () => {
    const time = "2026-09-29T10:11:12.123456+00:00";
    expect(parseConnectionCursor(time,id)).toEqual({time,id});
    expect(parseConnectionCursor(null,null)).toBeNull();
    for(const [cursorTime,idValue] of [[null,id],[time,null],["yesterday",id],["2026-09-29T10:11:12.123456789Z",id]]) expect(()=>parseConnectionCursor(cursorTime,idValue)).toThrow();
  });
  it("does not invent a generation for missing or hidden connections", () => {
    for(const state of ["none","self","unavailable"]) {
      expect(parseConnection({state,id:null})).toEqual({state,id:null});
      expect(()=>parseConnection({state,id})).toThrow();
    }
    expect(()=>parseConnection({state:"friends",id:null})).toThrow();
    expect(()=>parseConnectionList("all")).toThrow();
  });
  it("reads only safe profile fields in a connection list", () => {
    const item = parseConnectionItem({id,userId:id,username:"player_one",displayName:"Player",createdAt:"2026-09-29T10:11:12Z",state:"friends",email:"hidden@example.test",role:"admin"});
    expect(item).not.toHaveProperty("email"); expect(item).not.toHaveProperty("role");
  });
});
