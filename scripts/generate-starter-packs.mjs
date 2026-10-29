// Reproducible original starter music, packaged with the same validator as imports.
// Run explicitly with node scripts/generate-starter-packs.mjs; not during builds.
import { createServer } from "vite";
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const vite = await createServer({ configFile: false, cacheDir: ".tools/starter-vite", optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: "custom" });
try {
  const { chartModes } = await vite.ssrLoadModule("/src/features/rhythm/data/charts.ts");
  const { packMap } = await vite.ssrLoadModule("/src/features/maps/data/package.ts");
  const catalog = [];
  const definitions = [
    { id: "orbit-signal", title: "Orbit Signal", chart: chartModes.geometry, root: 57, names: ["First light", "Orbit"] },
    { id: "violet-hours", title: "Violet Hours", chart: chartModes.rhythms, root: 60, names: ["Pulse", "Afterglow"] },
    { id: "first-contact", title: "First Contact", chart: chartModes.basic, root: 64, names: ["Introduction", "Lift off"] },
  ];
  await mkdir("public/maps", { recursive: true });
  for (const def of definitions) {
    const rate = 44100, length = Math.ceil(def.chart.durationMs / 1000 * rate), samples = new Float64Array(length);
    let random = 41;
    const noise = () => { random = (1664525 * random + 1013904223) >>> 0; return random / 2147483648 - 1; };
    const voice = (at, seconds, frequency, volume, kind = "pluck") => {
      const offset = Math.round(at * rate), count = Math.ceil(seconds * rate);
      for (let i = 0; i < count && offset + i < length; i++) {
        const t = i / rate, attack = Math.min(1, t / .006), tail = Math.min(1, (seconds - t) / .04);
        const wave = kind === "hat" ? noise() * Math.exp(-t * 90) : kind === "kick" ? Math.sin(2 * Math.PI * (48 * t + 2.4 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 16) :
          (Math.sin(2 * Math.PI * frequency * t) + .22 * Math.sin(2 * Math.PI * frequency * 2 * t)) * Math.exp(-t * (kind === "pad" ? 1.6 : 7));
        if (offset + i >= 0) samples[offset + i] += wave * volume * attack * tail;
      }
    };
    const beat = 60 / def.chart.timing[0].bpm, steps = Math.ceil(def.chart.durationMs / 1000 / beat), harmony = [0, -3, -5, -7];
    const hz = midi => 440 * 2 ** ((midi - 69) / 12);
    for (let b = 0; b < steps; b++) {
      const root = def.root + harmony[Math.floor(b / 16) % 4];
      voice(b * beat, .25, 0, .3, "kick"); voice((b + .5) * beat, .07, 0, .065, "hat");
      voice(b * beat, beat * .85, hz(root - 24), .13);
      if (b % 4 === 0) for (const interval of [0, 3, 7]) voice(b * beat, beat * 3.8, hz(root + interval), .033, "pad");
    }
    const scale = [0, 3, 7, 10, 7, 3, 5, 7];
    def.chart.notes.forEach((note, i) => {
      const root = def.root + harmony[Math.floor(note.timeMs / 1000 / beat / 16) % 4];
      voice(note.timeMs / 1000, note.kind === "hold" ? (note.endMs - note.timeMs) / 1000 : .19, hz(root + 12 + scale[i % scale.length]), .15);
      if (note.kind === "hold") voice(note.endMs / 1000, .16, hz(root + 19), .1);
    });
    const wav = Buffer.alloc(44 + length * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(length * 2, 40);
    for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(Math.tanh(samples[i]) * .85 * Math.min(1, (length - i) / (rate * .1)) * 32767), 44 + i * 2);
    const sha256 = createHash("sha256").update(wav).digest("hex");
    const chart = { ...def.chart, title: def.title, artist: "notsu sound lab", audioOffsetMs: 0, audioSha256: sha256 };
    const difficulties = def.names.map((name, index) => ({ name, author: "notsu", chart: { ...chart, id: `${def.id}-${index + 1}`, notes: index ? chart.notes : chart.notes.filter((note, i) => note.kind === "hold" || i % 2 === 0) } }));
    const set = { format: "notsu-map", version: 1, id: def.id, title: def.title, artist: chart.artist, author: "notsu", song: { fileName: `${def.id}.wav`, mime: "audio/wav", size: wav.length, durationMs: length / rate * 1000, sha256 }, difficulties };
    const packed = await packMap(set, new Uint8Array(wav));
    await writeFile(`public/maps/${def.id}.notsumap`, packed.bytes);
    catalog.push({ revision: packed.revision, setId: set.id, title: set.title, artist: set.artist, author: set.author, importedAt: 0, favorite: false,
      difficulties: difficulties.map(d => ({ id: d.chart.id, name: d.name, author: d.author, notes: d.chart.notes.length, lanes: d.chart.lanes.length, durationMs: d.chart.durationMs })), file: `${def.id}.notsumap` });
    console.log(`${def.title}: ${packed.bytes.length} bytes, two difficulties and embedded audio`);
  }
  await writeFile("src/features/maps/data/starterCatalog.json", JSON.stringify(catalog, null, 2) + "\n");
} finally { await vite.close(); }
