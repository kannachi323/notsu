import type { Chart, ChartNote, Lane } from "../domain/chart";
import { validateChart } from "../domain/chart";

const beat = 60_000 / 120;
const laneIds = ["north", "east", "south", "west"];
const corners = [[.325, .23], [.65, .23], [.65, .73], [.325, .73]];
const lanes: Lane[] = laneIds.map((id, index) => ({
  id,
  motion: [0, 12, 16, 28, 32, 44, 48, 60].map(at => {
    const turn = Math.floor(at / 16);
    const corner = (index + turn) % 4;
    const [x, y] = corners[corner];
    return { timeMs: at * beat, x, y, angle: (index + turn) * 90, length: 260 };
  }),
}));
const notes: ChartNote[] = [];
for (let bar = 0; bar < 4; bar++) {
  const offset = bar * 16;
  // Independent visual lanes alternate. Every fourth pulse shares all targets.
  for (const at of [4, 5, 6, 7, 8, 9, 10, 11, 14, 15]) {
    notes.push({ id: "tap-" + (offset + at), kind: "tap", timeMs: (offset + at) * beat,
      laneIds: at % 4 === 0 ? [...laneIds] : [laneIds[(at + bar) % 4]] });
  }
  notes.push({ id: "hold-" + offset, kind: "hold", timeMs: (offset + 12) * beat,
    endMs: (offset + 13.5) * beat, laneIds: [laneIds[bar], laneIds[(bar + 2) % 4]] });
}
export const geometryChart: Chart = {
  version: 2, id: "geometry-study-v1", title: "Moving together", artist: "Original synthesized practice",
  durationMs: 64 * beat, audioOffsetMs: 0, timing: [{ timeMs: 0, bpm: 120 }],
  lanes, notes: notes.sort((a, b) => a.timeMs - b.timeMs),
};
validateChart(geometryChart);
