import { describe, expect, it } from "vitest";
import { gradeFor, RhythmSession } from "./session";
import type { LegacyChart, Note } from "./chart";
import { demoChart, rhythmDrillChart, songChart } from "../data/charts";

const tap = (timeMs = 1000, id = "tap"): Note => ({ id, kind: "tap", timeMs });
const hold: Note = { id: "hold", kind: "hold", timeMs: 1000, endMs: 2000 };
const chart = (notes: Note[]): LegacyChart => ({ version: 1, id: "test", title: "Test", artist: "Test", bpm: 120, durationMs: 4000, audioOffsetMs: 0, notes, motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }] });

describe("ordered judgement events", () => {
  it("retains every rapid judgement and drains once while preserving HUD feedback", () => {
    const run = new RhythmSession(chart([tap(1000,"a"),tap(1100,"b")]));
    run.press("KeyA",1000); run.press("KeyS",1100); run.press("KeyD",1105);
    expect(run.drainJudgements()).toEqual([
      {id:1,noteId:"a",grade:"Perfect",action:"tap",atMs:1000,errorMs:0},
      {id:2,noteId:"b",grade:"Perfect",action:"tap",atMs:1100,errorMs:0},
      {id:3,grade:"Extra",action:"tap",atMs:1105},
    ]);
    expect(run.drainJudgements()).toEqual([]);
    expect(run.feedback).toEqual({grade:"Extra",action:"tap",atMs:1105});
  });
  it("identifies hold transitions and retains two scored misses for an untouched hold", () => {
    const run = new RhythmSession(chart([hold]));
    run.press("KeyA",1000); run.release("KeyA",2000);
    expect(run.drainJudgements().map(({id,noteId,action}) => ({id,noteId,action}))).toEqual([
      {id:1,noteId:"hold",action:"press"},{id:2,noteId:"hold",action:"release"},
    ]);
    const missed = new RhythmSession(chart([hold])); missed.advance(1200);
    expect(missed.drainJudgements().map(event => event.action)).toEqual(["press","release"]);
    expect(missed.summary().counts.Miss).toBe(2);
  });
});

describe("judgement windows", () => {
  it.each([[0, "Perfect"], [-45, "Perfect"], [45, "Perfect"], [46, "Good"], [-90, "Good"], [90, "Good"], [91, "Okay"], [-140, "Okay"], [140, "Okay"], [141, "Miss"], [-141, "Miss"]])("grades %s ms as %s", (error, grade) => {
    expect(gradeFor(Number(error))).toBe(grade);
  });
  it("does not expire the inclusive late edge", () => {
    const run = new RhythmSession(chart([tap()]));
    run.advance(1140); run.press("KeyA", 1140);
    expect(run.summary().counts.Okay).toBe(1);
  });
});

describe("tap input", () => {
  it("uses chronological order where windows overlap and consumes one note", () => {
    const run = new RhythmSession(chart([tap(1000,"a"), tap(1100,"b")]));
    run.press("KeyA", 1090);
    expect(run.states[0].head).toBe("Good"); expect(run.states[1].head).toBeUndefined();
  });
  it("ignores repeated keydown until the key is released", () => {
    const run = new RhythmSession(chart([tap(1000,"a"), tap(1200,"b")]));
    run.press("KeyA", 1000); run.press("KeyA", 1200);
    expect(run.summary().judged).toBe(1);
    run.release("KeyA", 1200); run.press("KeyA", 1200);
    expect(run.summary().counts.Perfect).toBe(2);
  });
  it("penalizes mashing and breaks combo", () => {
    const run = new RhythmSession(chart([tap()]));
    run.press("KeyA", 1000); run.press("KeyS", 1000);
    expect(run.summary()).toMatchObject({ accuracy: 50, combo: 0, maxCombo: 1, extra: 1 });
  });
  it("does not penalize ordinary key releases", () => {
    const run = new RhythmSession(chart([tap()]));
    run.press("KeyA", 1000); run.release("KeyA", 1300);
    expect(run.summary().accuracy).toBe(100);
  });
});

describe("holds", () => {
  it("requires the original key but allows other-key taps during the hold", () => {
    const run = new RhythmSession(chart([hold, tap(1500)]));
    run.press("KeyA", 1000); run.press("KeyS", 1500); run.release("KeyS", 2000);
    expect(run.states[0].tail).toBeUndefined();
    run.release("KeyA", 2000);
    expect(run.summary()).toMatchObject({ accuracy: 100, judged: 3, expected: 3 });
  });
  it.each([1500,1859,2141,3000])("marks release at %s as one tail miss", time => {
    const run = new RhythmSession(chart([hold]));
    run.press("KeyA", 1000); run.release("KeyA", time); run.advance(4000);
    expect(run.summary().counts).toEqual({ Perfect: 1, Good: 0, Okay: 0, Miss: 1 });
  });
  it("judges early and late release boundaries", () => {
    for (const time of [1860,2140]) {
      const run = new RhythmSession(chart([hold]));
      run.press("KeyA", 1000); run.release("KeyA", time);
      expect(run.states[0].tail).toBe("Okay");
    }
  });
  it("misses both endpoints once if the head is never pressed", () => {
    const run = new RhythmSession(chart([hold]));
    run.advance(1200); run.advance(4000); run.release("KeyA", 4000);
    expect(run.summary().counts.Miss).toBe(2);
  });
  it("cannot rescue a broken hold by re-pressing", () => {
    const run = new RhythmSession(chart([hold]));
    run.press("KeyA",1000); run.release("KeyA",1400); run.press("KeyA",1600); run.release("KeyA",2000);
    expect(run.summary()).toMatchObject({ extra: 1, counts: { Perfect: 1, Miss: 1 } });
  });
});

describe("complete runs", () => {
  it.each([demoChart, rhythmDrillChart, songChart])("supports a perfect run of $id", source => {
    const run = new RhythmSession(source);
    const events = source.notes.flatMap(note => note.kind === "tap" ?
      [{ time: note.timeMs, down: true, key: "KeyS" }, { time: note.timeMs + 1, down: false, key: "KeyS" }] :
      [{ time: note.timeMs, down: true, key: "KeyA" }, { time: note.endMs, down: false, key: "KeyA" }]);
    events.sort((a,b) => a.time-b.time);
    for (const event of events) run[event.down ? "press" : "release"](event.key,event.time);
    run.advance(source.durationMs);
    expect(run.summary().accuracy).toBe(100);
    expect(run.summary().judged).toBe(run.expected);
  });
  it("gives identical outcomes with different render ticks", () => {
    const simulate = (fps: number) => {
      const run = new RhythmSession(chart([tap(1000,"a"),{id:"h",kind:"hold",timeMs:2000,endMs:3000}]));
      const events = [{time:1025,action:"press" as const,key:"KeyA"},{time:1050,action:"release" as const,key:"KeyA"},{time:2015,action:"press" as const,key:"KeyS"},{time:3100,action:"release" as const,key:"KeyS"}];
      for(let time=0;time<4000;time+=1000/fps) {
        while(events.length && events[0].time<=time) { const event=events.shift()!;run[event.action](event.key,event.time); }
        run.advance(time);
      }
      return run.summary();
    };
    expect(simulate(30)).toEqual(simulate(144));
  });
  it("starts a retry with no inherited held keys or scores", () => {
    const source = chart([hold]); const old = new RhythmSession(source); old.press("KeyA",1000);
    const retry = new RhythmSession(source);retry.press("KeyA",1000);retry.release("KeyA",2000);
    expect(retry.summary()).toMatchObject({accuracy:100,extra:0,judged:2});
  });
});
