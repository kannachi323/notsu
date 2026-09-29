import { createDocument } from "../../editor/domain/document";
import { editDocument } from "../../editor/domain/commands";
import { draftMapSet } from "../../editor/data/mapSet";
import { songHash } from "../../../shared/audio/song";
export async function mapFixture() {
  const audio = new Uint8Array([1, 2, 3, 4]);
  let doc = createDocument("intro", { sha256: await songHash(audio.buffer), fileName: "Recording.wav", mime: "audio/wav", durationMs: 10000, size: audio.length }, "Original song");
  doc = editDocument(doc, { type: "add-lane", id: "line-2", frame: { timeMs: 0, x: .5, y: .5, angle: 90, length: 180 } });
  doc = editDocument(doc, { type: "place", id: "shared-hold", timeMs: 1000, endMs: 2000, laneIds: ["line-1", "line-2"], divisor: 4 });
  return { doc, set: draftMapSet(doc, []), audio };
}
