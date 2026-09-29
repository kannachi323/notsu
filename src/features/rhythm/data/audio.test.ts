import { expect, it } from "vitest";
import { chartTimeAt } from "./audio";

it("maps event timestamps to output time, independent of handler delay", () => {
  const sample={currentTime:10.1,performanceNow:10000,startTime:8,outputLatency:.1,timestamp:{contextTime:10,performanceTime:10000}};
  expect(chartTimeAt(sample,9900)).toBeCloseTo(1900);
  expect(chartTimeAt({...sample,currentTime:10.15,performanceNow:10050},9900)).toBeCloseTo(1900);
});
it("uses latency-aware fallback for missing or stale timestamps", () => {
  const sample={currentTime:10.1,performanceNow:10000,startTime:8,outputLatency:.1};
  expect(chartTimeAt(sample,10000)).toBeCloseTo(2000);
  expect(chartTimeAt({...sample,timestamp:{contextTime:0,performanceTime:0}},10000)).toBeCloseTo(2000);
  expect(chartTimeAt({...sample,timestamp:{contextTime:1,performanceTime:1}},10000)).toBeCloseTo(2000);
});
it("reports a negative time during countdown", () => {
  expect(chartTimeAt({currentTime:2,performanceNow:1000,startTime:4,outputLatency:0},1000)).toBe(-2000);
});
