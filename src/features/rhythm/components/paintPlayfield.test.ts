import { expect, it, vi } from "vitest";
import { paintEffect } from "./orbs";
import { paintPlayfield } from "./paintPlayfield";
import { HitFeedback } from "./feedback";
import type { HitEffect } from "./feedback";
import { skins, getSkin } from "./skins";
import { RhythmSession } from "../domain/session";
import { songChart } from "../data/charts";
import { geometryChart } from "../data/geometryChart";
import { laneAnchor, REST_POSE } from "../domain/layout";

function canvas() {
  const calls: {method:string,args:unknown[],color:unknown}[] = [];
  const context = new Proxy({strokeStyle:"",fillStyle:"",globalAlpha:1}, {
    get(target,key) {
      if(key in target) return target[key as keyof typeof target];
      if(key === "createRadialGradient") return () => ({addColorStop:vi.fn()});
      return (...args:unknown[]) => calls.push({method:String(key),args,color:target.strokeStyle});
    },
  }) as unknown as CanvasRenderingContext2D;
  return {context,calls};
}
const effect: HitEffect = {event:{id:1,noteId:"a",grade:"Perfect",action:"tap",atMs:1000},anchor:laneAnchor(REST_POSE),durationMs:200,reducedMotion:false};
it("expands a local ring with at most four sparks, and expires without drawing", () => {
  const {context,calls}=canvas(), skin=getSkin("midnight");
  paintEffect(context,effect,1100,skin);
  expect(calls.filter(call=>call.method==="arc")).toHaveLength(5);
  expect(calls.find(call=>call.method==="translate")?.args).toEqual([effect.anchor.x,effect.anchor.y]);
  expect(calls.find(call=>call.method==="arc")?.args[2]).toBe(skin.target.radius+skin.effects.expansion*.5);
  calls.length=0; paintEffect(context,effect,1200,skin); expect(calls).toHaveLength(0);
});
it("reduced motion uses one static ring, with no moving sparks", () => {
  const {context,calls}=canvas(),skin=getSkin("midnight");
  for(const time of [1000,1100,1199]) paintEffect(context,{...effect,reducedMotion:true},time,skin);
  const arcs=calls.filter(call=>call.method==="arc");
  expect(arcs).toHaveLength(3);
  expect(arcs.map(call=>call.args[2])).toEqual([15,15,15]);
});
it("hold presses pulse without sparks; warnings have no success particles", () => {
  for(const event of [{...effect.event,action:"press" as const},{...effect.event,grade:"Extra" as const}]) {
    const {context,calls}=canvas(); paintEffect(context,{...effect,event},1100,getSkin("midnight"));
    expect(calls.filter(call=>call.method==="arc")).toHaveLength(1);
  }
});
it.each(skins)("draws live tap orbs after hold ribbons in $name", skin => {
  const chart={...songChart,notes:[{id:"h",kind:"hold" as const,timeMs:1000,endMs:2000,laneIds:["main"]},{id:"t",kind:"tap" as const,timeMs:1300,laneIds:["main"]}]};
  const session=new RhythmSession(chart); session.press("KeyA",1000);
  const {context,calls}=canvas();
  paintPlayfield(context,800,520,{phase:"playing",session,timeMs:1100,feedback:new HitFeedback(),
    settings:{skinId:skin.id,reducedMotion:false,freezeMotion:false,offsetMs:0,volume:.6,hitVolume:.15}});
  const ribbonIndex=calls.findIndex(call=>call.method==="lineTo" && call.color===skin.note.hold);
  const tapIndex=calls.findIndex(call=>call.method==="stroke" && call.color===skin.note.tap);
  expect(ribbonIndex).toBeGreaterThan(-1); expect(tapIndex).toBeGreaterThan(ribbonIndex);
});
it("renders every authored orientation at narrow and wide sizes with finite coordinates", () => {
  for(const skin of skins) for(const frame of songChart.lanes[0].motion) for(const [width,height] of [[640,480],[1280,720],[1920,1080]]) {
    const {context,calls}=canvas();
    paintPlayfield(context,width,height,{phase:"playing",session:new RhythmSession(songChart),timeMs:frame.timeMs,feedback:new HitFeedback(),
      settings:{skinId:skin.id,reducedMotion:false,freezeMotion:false,offsetMs:0,volume:.6,hitVolume:.15}});
    expect(calls.flatMap(call=>call.args).filter(arg=>typeof arg==="number").every(Number.isFinite)).toBe(true);
  }
});
it("freezes each lane's opening pose only for the explicit practice assist", () => {
  const positions = (timeMs: number, freezeMotion: boolean, reducedMotion: boolean) => {
    const {context, calls} = canvas();
    paintPlayfield(context, 800, 520, { phase: "playing", session: new RhythmSession(geometryChart, {}, { freezeMotion }), timeMs,
      feedback: new HitFeedback(), settings: { skinId: "midnight", volume: .6, hitVolume: .15, offsetMs: 0, reducedMotion, freezeMotion } });
    return calls.filter(call => call.method === "translate" || call.method === "rotate").map(call => call.args);
  };
  expect(positions(0, true, false)).toEqual(positions(8000, true, false));
  expect(positions(0, false, true)).not.toEqual(positions(8000, false, true));
});
