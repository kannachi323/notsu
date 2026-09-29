import { expect, it, vi } from "vitest";
import { RhythmSession } from "../domain/session";
import { demoChart } from "../data/charts";
import { HitFeedback, MAX_EFFECTS } from "./feedback";
import { getSkin, noteRadius, skins, skinVariables } from "./skins";
import { laneAnchor } from "../domain/layout";
import { lanePoseAt } from "../domain/chart";
import type { Chart } from "../domain/chart";

const chart: Chart = { ...demoChart, durationMs: 5000, notes: [
  {id:"hold",kind:"hold",timeMs:1000,endMs:2000,laneIds:["main"]}, {id:"tap",kind:"tap",timeMs:1500,laneIds:["main"]},
], lanes:[{id:"main",motion:[{timeMs:0,x:.2,y:.4,angle:0,length:420},{timeMs:3000,x:.4,y:.7,angle:90,length:420}]}] };
const skin = getSkin("midnight");

it("consumes once, retains overlaps, snapshots anchors, and expires on the boundary", () => {
  const session = new RhythmSession(chart), feedback = new HitFeedback(), play = vi.fn();
  session.press("KeyA",1000); feedback.consume(session,skin,false,play);
  const firstAnchor = {...feedback.effects[0].anchor};
  session.press("KeyS",1010); feedback.consume(session,skin,false,play);
  feedback.consume(session,skin,false,play);
  expect(feedback.effects).toHaveLength(2); expect(play).toHaveBeenCalledTimes(1);
  expect(feedback.effects[0].anchor).toEqual(firstAnchor);
  expect(feedback.effects[1].anchor).not.toEqual(firstAnchor);
  feedback.expire(1200); expect(feedback.effects).toHaveLength(1);
  feedback.expire(1210); expect(feedback.effects).toHaveLength(0);
});
it("uses a single fade for a hold's two misses and no sound", () => {
  const session = new RhythmSession(chart), feedback = new HitFeedback(), play = vi.fn();
  session.advance(1200); feedback.consume(session,skin,false,play);
  expect(session.summary().counts.Miss).toBe(2);
  expect(feedback.effects).toHaveLength(1);
  expect(feedback.effects[0].failed).toMatchObject({held:false}); expect(play).not.toHaveBeenCalled();
});
it("keeps a broken hold at the target and gives successful releases their own sound", () => {
  for (const releaseTime of [1600,2000]) {
    const session = new RhythmSession(chart), feedback = new HitFeedback(), play = vi.fn();
    session.press("KeyA",1000); feedback.consume(session,skin,true,play);
    session.press("KeyS",1500); feedback.consume(session,skin,true,play);
    session.release("KeyA",releaseTime); feedback.consume(session,skin,true,play);
    const last = feedback.effects.at(-1)!;
    expect(last.anchor).toEqual(laneAnchor(lanePoseAt(chart.lanes[0],releaseTime))); expect(last.reducedMotion).toBe(true);
    if (releaseTime === 1600) { expect(last.failed).toMatchObject({head:0,held:true}); expect(play).toHaveBeenCalledTimes(2); }
    else { expect(last.failed).toBeUndefined(); expect(play).toHaveBeenLastCalledWith(skin.sounds.release, "release"); }
  }
});
it("caps effects and clears all per-attempt history for retry", () => {
  const session = new RhythmSession(chart,{noFail:true}), feedback = new HitFeedback();
  for (let i=0;i<100;i++) session.press(`key${i}`,0);
  feedback.consume(session,skin,false,()=>{}); expect(feedback.effects).toHaveLength(MAX_EFFECTS);
  feedback.clear(); expect(feedback.effects).toHaveLength(0);
  const retry = new RhythmSession(chart); retry.press("KeyA",1000);
  feedback.consume(retry,skin,false,()=>{}); expect(feedback.effects[0].event.id).toBe(1);
});
it("produces identical scoring under both skins while exposing shared CSS tokens", () => {
  const results = skins.map(skin => {
    const session = new RhythmSession(chart), feedback = new HitFeedback();
    session.press("KeyA",1000); feedback.consume(session,skin,false,()=>{});
    session.press("KeyS",1510); feedback.consume(session,skin,false,()=>{});
    session.release("KeyA",2050); feedback.consume(session,skin,false,()=>{});
    expect(noteRadius(skin)).toBeGreaterThanOrEqual(8); expect(noteRadius(skin)).toBeLessThanOrEqual(10);
    expect(skin.target.radius).toBeGreaterThan(noteRadius(skin));
    expect(skinVariables(skin)["--accent"]).toBe(skin.note.tap);
    return session.summary();
  });
  expect(results[0]).toEqual(results[1]);
  expect(noteRadius({...skin,note:{...skin.note,radius:100}})).toBe(10);
  expect(noteRadius({...skin,note:{...skin.note,radius:1}})).toBe(8);
});
