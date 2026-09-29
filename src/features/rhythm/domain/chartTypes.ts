export type Note =
  | { id: string; kind: "tap"; timeMs: number }
  | { id: string; kind: "hold"; timeMs: number; endMs: number };

export type Pose = { x: number; y: number; angle: number };
export type MotionKeyframe = Pose & { timeMs: number };
export type LaneKeyframe = MotionKeyframe & { length: number; easing?: "smooth" | "linear" };
export type Lane = { id: string; motion: LaneKeyframe[] };
export type TimingPoint = { timeMs: number; bpm: number };

interface Metadata {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  audioOffsetMs: number;
  audioSha256?: string;
}

/** Import format of the original single-lane prototype. */
export interface LegacyChart extends Metadata {
  version: 1;
  bpm: number;
  notes: Note[];
  motion: MotionKeyframe[];
}

/** A logical note scores once; laneIds are only its visual instances. */
export type ChartNote = Note & { laneIds: string[] };
export interface Chart extends Metadata {
  version: 2;
  timing: TimingPoint[];
  notes: ChartNote[];
  lanes: Lane[];
}
export type ChartSource = Chart | LegacyChart;
