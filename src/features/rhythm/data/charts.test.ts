import { describe, expect, it } from "vitest";
import { chartModes, demoChart, rhythmDrillChart, songChart } from "./charts";
import { RhythmSession } from "../domain/session";
import { APPROACH_MS, validateChart } from "../domain/chart";
import type { Chart } from "../domain/chart";
import { LANE_LENGTH } from "../domain/layout";
import { noteRadius, skins } from "../components/skins";

const gapsInBeats = (chart: Chart) => chart.notes.slice(1).map((note,index) =>
  (note.timeMs-chart.notes[index].timeMs)/(60_000/chart.bpm));
const contains = (gaps: number[], spacing: number) => gaps.some(gap=>Math.abs(gap-spacing)<1e-9);

describe("authored rhythm vocabulary", () => {
  it.each([songChart,rhythmDrillChart])("includes triplets, dotted quarters/eighths and sixteenths in $id", chart => {
    expect(()=>validateChart(chart)).not.toThrow();
    const gaps=gapsInBeats(chart);
    for(const spacing of [1/3,1.5,.75,.25]) expect(contains(gaps,spacing)).toBe(true);
    // Quarter, eighth, sixteenth and triplet positions share a twelfth-beat grid.
    for(const note of chart.notes) {
      const grid=note.timeMs/(60_000/chart.bpm)*12;
      expect(grid).toBeCloseTo(Math.round(grid),8);
    }
  });
  it.each([songChart,rhythmDrillChart])("keeps fast rolls short and gives both hands independent work in $id", chart => {
    let run=0,longest=0;
    for(const gap of gapsInBeats(chart)) {
      run=Math.abs(gap-.25)<1e-9 ? run+1 : 0; longest=Math.max(longest,run);
    }
    expect(longest).toBeGreaterThanOrEqual(7);
    expect(longest).toBeLessThanOrEqual(8);
    const independentHolds=chart.notes.filter(note=>note.kind==="hold" && chart.notes.filter(tap=>
      tap.kind==="tap" && tap.timeMs>note.timeMs && tap.timeMs<note.endMs).length>=3);
    expect(independentHolds.length).toBeGreaterThanOrEqual(2);
    expect(contains(gapsInBeats(chart),2)).toBe(true);
  });
  it("preserves the gentle introductory chart", () => {
    expect(demoChart.durationMs).toBe(10000);
    expect(new RhythmSession(demoChart).expected).toBe(30);
    expect(Math.min(...gapsInBeats(demoChart))).toBe(.5);
  });
  it("preserves the song cut and gives the new arrangement a distinct identity", () => {
    expect(songChart.id).toBe("mou-ii-kai-study-v2");
    expect(songChart).toMatchObject({bpm:192,audioOffsetMs:35401,durationMs:40000});
    expect(songChart.motion.map(frame=>frame.timeMs)).toEqual([0,3750,5000,8750,10000,13750,15000,18750,20000,23750,25000,28750,30000,33750,35000]);
  });
  it.each([songChart,rhythmDrillChart])("keeps adjacent orb centres separated in both skins for $id", chart => {
    const gapMs=Math.min(...gapsInBeats(chart))*(60_000/chart.bpm);
    const separation=gapMs/APPROACH_MS*LANE_LENGTH;
    for(const skin of skins) expect(separation).toBeGreaterThan(2*noteRadius(skin)+1);
  });
});

/** Alternate F/J when free; reserve F for holds and play their taps on J. */
function playWithTwoKeys(chart: Chart, jitter: number, fps: number) {
  let holdUntil=-1,hand=0;
  const events=chart.notes.flatMap((note,index)=>{
    const offset=(index%2 ? 1 : -1)*jitter;
    if(note.kind==="hold") {
      holdUntil=note.endMs;
      return [{at:note.timeMs+offset,key:"KeyF",down:true},{at:note.endMs+offset,key:"KeyF",down:false}];
    }
    const key=note.timeMs<holdUntil ? "KeyJ" : ["KeyF","KeyJ"][hand++%2];
    return [{at:note.timeMs+offset,key,down:true},{at:note.timeMs+offset+20,key,down:false}];
  }).sort((a,b)=>a.at-b.at);
  const session=new RhythmSession(chart);
  let index=0;
  for(let time=0;time<chart.durationMs+200;time+=1000/fps) {
    while(index<events.length && events[index].at<=time) {
      const event=events[index++]; session[event.down ? "press" : "release"](event.key,event.at);
    }
    session.advance(time);
  }
  return session.summary();
}
describe("dense chart playability", () => {
  it.each(Object.values(chartModes))("can complete $id with just two keys and realistic key-up delays", chart => {
    for(const jitter of [0,15]) {
      const slow=playWithTwoKeys(chart,jitter,30),fast=playWithTwoKeys(chart,jitter,144);
      expect(slow).toEqual(fast);
      expect(slow).toMatchObject({accuracy:100,extra:0,judged:slow.expected});
    }
  });
});
