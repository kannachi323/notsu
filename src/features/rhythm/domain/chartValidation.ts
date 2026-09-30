import type { Chart, ChartSource } from "./chartTypes";
import { HIT_WINDOW_MS } from "./rules";

const fail = (message: string): never => { throw new Error(message); };
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail("Expected a chart object.");
const numeric = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 256;
const list = (value: unknown, max: number): unknown[] =>
  Array.isArray(value) && value.length > 0 && value.length <= max ? value : fail("Invalid chart collection size.");

function validateMotion(value: unknown, duration: number, legacy: boolean) {
  let previous = -1;
  for (const [index, item] of list(value, 10000).entries()) {
    const frame = object(item);
    if (!numeric(frame.timeMs, 0, duration) || frame.timeMs <= previous || (index === 0 && frame.timeMs !== 0) ||
        !numeric(frame.x, 0, 1) || !numeric(frame.y, 0, 1) || !numeric(frame.angle, -36000, 36000) ||
        (!legacy && (!numeric(frame.length, 48, 420) || (frame.easing !== undefined && frame.easing !== "smooth" && frame.easing !== "linear")))) {
      fail("Invalid movement keyframe.");
    }
    previous = frame.timeMs as number;
  }
}

/** Validate unknown imports before using any of their nested values. */
export function validateChart(value: unknown, options: { allowEmptyNotes?: boolean } = {}): asserts value is ChartSource {
  const chart = object(value);
  const legacy = chart.version === 1;
  if ((!legacy && chart.version !== 2) || !name(chart.id) || !name(chart.title) || !name(chart.artist) ||
      !numeric(chart.durationMs, 1, 30 * 60_000) || !numeric(chart.audioOffsetMs, 0, 24 * 60 * 60_000) ||
      (chart.audioSha256 !== undefined && (typeof chart.audioSha256 !== "string" || !/^[a-f0-9]{64}$/.test(chart.audioSha256)))) {
    fail("Invalid chart metadata.");
  }
  const duration = chart.durationMs as number;
  const laneIds = new Set<string>();
  if (legacy) {
    if (!numeric(chart.bpm, 1, 1000)) fail("Invalid chart tempo.");
    validateMotion(chart.motion, duration, true);
  } else {
    let previous = -1;
    for (const [index, item] of list(chart.timing, 10000).entries()) {
      const point = object(item);
      if (!numeric(point.bpm, 1, 1000) || !numeric(point.timeMs, 0, duration) || point.timeMs <= previous ||
          (index === 0 && point.timeMs !== 0)) fail("Invalid timing section.");
      previous = point.timeMs as number;
    }
    for (const item of list(chart.lanes, 16)) {
      const lane = object(item);
      if (!name(lane.id) || laneIds.has(lane.id)) fail("Lane IDs must be unique.");
      laneIds.add(lane.id as string);
      validateMotion(lane.motion, duration, false);
    }
  }
  const ids = new Set<string>();
  let previous = -Infinity;
  const notes = options.allowEmptyNotes && Array.isArray(chart.notes) && chart.notes.length === 0 ? [] : list(chart.notes, 100000);
  for (const item of notes) {
    const note = object(item);
    if (!name(note.id) || ids.has(note.id) || (note.kind !== "tap" && note.kind !== "hold") ||
        !numeric(note.timeMs, 0, duration - HIT_WINDOW_MS) || note.timeMs <= previous) {
      fail("Notes need unique IDs and increasing times. Combine simultaneous circles into one shared hit.");
    }
    if (note.kind === "hold" && !numeric(note.endMs, (note.timeMs as number) + 1, duration - HIT_WINDOW_MS)) {
      fail("A hold must end after it starts, inside the chart.");
    }
    if (!legacy) {
      const instances = list(note.laneIds, 16);
      if (new Set(instances).size !== instances.length || instances.some(id => typeof id !== "string" || !laneIds.has(id))) {
        fail("Every note instance must reference a distinct existing lane.");
      }
    }
    ids.add(note.id as string);
    previous = note.timeMs as number;
  }
}

/** Clone at the import boundary so editor mutations cannot alter an active run. */
export function loadChart(value: unknown, options: { allowEmptyNotes?: boolean } = {}): Chart {
  validateChart(value, options);
  if (value.version === 2) return {
    ...value,
    timing: value.timing.map(point => ({ ...point })),
    notes: value.notes.map(note => ({ ...note, laneIds: [...note.laneIds] })),
    lanes: value.lanes.map(lane => ({ ...lane, motion: lane.motion.map(frame => ({ ...frame })) })),
  };
  const { bpm, motion, notes, ...metadata } = value;
  return {
    ...metadata, version: 2,
    timing: [{ timeMs: 0, bpm }],
    notes: notes.map(note => ({ ...note, laneIds: ["main"] })),
    lanes: [{ id: "main", motion: motion.map(frame => ({ ...frame, length: 420 })) }],
  };
}
