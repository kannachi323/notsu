import type { Chart, MotionKeyframe, Note, Pose } from "../domain/chart";
import { validateChart } from "../domain/chart";
import { basicPhrases, drillPhrases, songPhrases } from "./patterns";
import type { Phrase } from "./patterns";

const beatMs = 60_000 / 192;

const poses: Pose[] = [
  { x: .20, y: .62, angle: 0 },
  { x: .26, y: .72, angle: -32 },
  { x: .66, y: .14, angle: 90 },
  { x: .28, y: .23, angle: 32 },
  { x: .72, y: .62, angle: 180 },
  { x: .77, y: .76, angle: 215 },
  { x: .38, y: .16, angle: 90 },
  { x: .24, y: .55, angle: 0 },
];

function makeNotes(source: Phrase[], beatDuration = beatMs): Note[] {
  const notes: Note[] = source.flatMap((phrase, index) => {
    const at = (beat: number) => (index * 16 + beat) * beatDuration;
    return [
      ...phrase.taps.map((beat): Note => ({ id: `p${index}-t${beat}`, kind: "tap", timeMs: at(beat) })),
      ...phrase.holds.map(([start, end]): Note => ({ id: `p${index}-h${start}`, kind: "hold", timeMs: at(start), endMs: at(end) })),
    ];
  });
  return notes.sort((a, b) => a.timeMs - b.timeMs);
}

function makeMotion(count: number, beatDuration = beatMs): MotionKeyframe[] {
  const frames: MotionKeyframe[] = [{ timeMs: 0, ...poses[0] }];
  for (let i = 0; i < count - 1; i++) {
    // Stay for twelve beats, then glide for four. Arrival is exactly on the next phrase.
    frames.push({ timeMs: (i * 16 + 12) * beatDuration, ...poses[i] });
    frames.push({ timeMs: ((i + 1) * 16) * beatDuration, ...poses[i + 1] });
  }
  return frames;
}

export const songChart: Chart = {
  version: 1, id: "mou-ii-kai-study-v2", title: "Mou Ii Kai?", artist: "THE ORAL CIGARETTES",
  bpm: 192, durationMs: 40_000, audioOffsetMs: 35_401,
  audioSha256: "f9b17daaff3571bb758ecfe1402a2108f64121aca0e0dc053af49fb6a5b0b33f",
  notes: makeNotes(songPhrases), motion: makeMotion(8),
};

export const demoChart: Chart = {
  version: 1, id: "timing-study-v1", title: "Timing study", artist: "Original synthesized practice",
  bpm: 192, durationMs: 10_000, audioOffsetMs: 0,
  notes: makeNotes(basicPhrases), motion: makeMotion(2),
};

export const rhythmDrillChart: Chart = {
  version: 1, id: "rhythm-drill-v1", title: "Two-hand rhythm drill", artist: "Dotted rhythms · triplets · sixteenths",
  bpm: 144, durationMs: 64 * (60_000 / 144), audioOffsetMs: 0,
  notes: makeNotes(drillPhrases, 60_000 / 144), motion: makeMotion(4, 60_000 / 144),
};

export const chartModes = { song: songChart, basic: demoChart, rhythms: rhythmDrillChart };
export type ChartMode = keyof typeof chartModes;

validateChart(songChart);
validateChart(demoChart);
validateChart(rhythmDrillChart);
