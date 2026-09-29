import { describe, expect, it } from "vitest";
import { poseAt, validateChart } from "./chart";
import { songChart } from "../data/charts";
import { laneAnchor, LANE_LENGTH, WORLD_HEIGHT, WORLD_WIDTH } from "./layout";

describe("chart validation", () => {
  it("rejects simultaneous heads", () => {
    expect(() => validateChart({...songChart,notes:[{id:"a",kind:"tap",timeMs:1000},{id:"b",kind:"tap",timeMs:1000}]})).toThrow();
  });
  it("rejects overlapping holds and insufficient release space", () => {
    expect(() => validateChart({...songChart,notes:[{id:"a",kind:"hold",timeMs:1000,endMs:2000},{id:"b",kind:"hold",timeMs:2100,endMs:2500}]})).toThrow();
  });
  it("rejects non-finite and out-of-range timing", () => {
    expect(() => validateChart({...songChart,durationMs:NaN})).toThrow();
    expect(() => validateChart({...songChart,notes:[{id:"a",kind:"tap",timeMs:40000}]})).toThrow();
  });
  it("rejects unordered motion", () => {
    expect(() => validateChart({...songChart,motion:[songChart.motion[1],songChart.motion[0]]})).toThrow();
  });
});

describe("choreography", () => {
  it("arrives exactly at every authored keyframe", () => {
    for(const keyframe of songChart.motion) {
      expect(poseAt(songChart.motion,keyframe.timeMs)).toMatchObject({x:keyframe.x,y:keyframe.y,angle:keyframe.angle});
      expect(keyframe.timeMs / (60000/songChart.bpm) % 1).toBe(0);
    }
  });
  it("smooths halfway between poses without overshooting", () => {
    expect(poseAt([{timeMs:0,x:0,y:0,angle:0},{timeMs:1000,x:1,y:1,angle:90}],500)).toEqual({x:.5,y:.5,angle:45});
  });
  it("keeps the gate and lane endpoints in bounds throughout the chart", () => {
    for(let time=0;time<=songChart.durationMs;time+=10) {
      const p=laneAnchor(poseAt(songChart.motion,time));
      for(const distance of [0,LANE_LENGTH]) {
        const x=p.x+Math.cos(p.radians)*distance,y=p.y+Math.sin(p.radians)*distance;
        expect(x).toBeGreaterThanOrEqual(41);expect(x).toBeLessThanOrEqual(WORLD_WIDTH-41);
        expect(y).toBeGreaterThanOrEqual(41);expect(y).toBeLessThanOrEqual(WORLD_HEIGHT-41);
      }
    }
  });
});
