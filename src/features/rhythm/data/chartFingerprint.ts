import { loadChart } from "../domain/chart";
import type { ChartSource } from "../domain/chart";

/** Explicit fields make identity independent of object insertion order or extra keys. */
export async function chartFingerprint(source: ChartSource): Promise<string> {
  const chart = loadChart(source);
  const canonical = {
    version: chart.version, id: chart.id, title: chart.title, artist: chart.artist,
    durationMs: chart.durationMs, audioOffsetMs: chart.audioOffsetMs, audioSha256: chart.audioSha256 ?? null,
    timing: chart.timing.map(point => [point.timeMs, point.bpm]),
    lanes: chart.lanes.map(lane => [lane.id, lane.motion.map(frame =>
      [frame.timeMs, frame.x, frame.y, frame.angle, frame.length, frame.easing ?? "smooth"])]),
    notes: chart.notes.map(note =>
      [note.id, note.kind, note.timeMs, note.kind === "hold" ? note.endMs : null, note.laneIds]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}
