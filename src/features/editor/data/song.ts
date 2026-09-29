import type { SongReference } from "../domain/document";

export const MAX_SONG_BYTES = 100 * 1024 * 1024;
export type ImportedSong = { reference: SongReference; bytes: ArrayBuffer; buffer: AudioBuffer; peaks: Float32Array };
export function songMime(fileName: string): SongReference["mime"] {
  if (/\.mp3$/i.test(fileName)) return "audio/mpeg";
  if (/\.wav$/i.test(fileName)) return "audio/wav";
  throw new Error("Choose an MP3 or WAV recording.");
}
export async function songHash(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
}
/** Keep the strongest peak from either channel; stereo cancellation must not hide beats. */
export function peakRange(channels: Float32Array[], start: number, end: number): number {
  let peak = 0;
  for (const channel of channels) for (let i = start; i < Math.min(end, channel.length); i++) {
    if (Number.isFinite(channel[i])) peak = Math.max(peak, Math.abs(channel[i]));
  }
  return Math.min(1, peak);
}
export async function waveform(buffer: AudioBuffer): Promise<Float32Array> {
  const count = Math.min(16000, Math.ceil(buffer.duration * 40)), peaks = new Float32Array(count);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < count; i++) {
    peaks[i] = peakRange(channels, Math.floor(i * buffer.length / count), Math.floor((i + 1) * buffer.length / count));
    if (i % 256 === 255) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return peaks;
}
export async function decodeSong(bytes: ArrayBuffer, fileName: string, context: BaseAudioContext, expectedHash?: string): Promise<ImportedSong> {
  const mime = songMime(fileName);
  if (!bytes.byteLength || bytes.byteLength > MAX_SONG_BYTES) throw new Error("Choose a recording up to 100 MB.");
  const sha256 = await songHash(bytes);
  if (expectedHash && sha256 !== expectedHash) throw new Error("The saved recording has changed. Choose the original file.");
  // Metadata is available without allocating the entire decoded PCM recording.
  if (typeof Audio !== "undefined") await probeDuration(bytes, mime);
  let buffer: AudioBuffer;
  try { buffer = await context.decodeAudioData(bytes.slice(0)); }
  catch { throw new Error("This recording could not be decoded. Try another MP3 or WAV file."); }
  if (buffer.duration < 1 || buffer.duration > 1800 || buffer.numberOfChannels > 2 || buffer.length * buffer.numberOfChannels * 4 > 512 * 1024 * 1024) {
    throw new Error("Use a mono or stereo recording between 1 second and 30 minutes, with decoded audio under 512 MB.");
  }
  const reference: SongReference = { sha256, fileName, mime, size: bytes.byteLength, durationMs: buffer.duration * 1000 };
  return { reference, bytes, buffer, peaks: await waveform(buffer) };
}
export function probeDuration(bytes: ArrayBuffer, mime: SongReference["mime"]): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(), url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const cleanup = () => { clearTimeout(timer); audio.onloadedmetadata = audio.onerror = null; audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); };
    const fail = (text: string) => { cleanup(); reject(new Error(text)); };
    const timer = setTimeout(() => fail("Reading the recording took too long. Try another MP3 or WAV file."), 10000);
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration < 1 || duration > 1800) { fail("Use a recording between 1 second and 30 minutes."); return; }
      cleanup(); resolve(duration);
    };
    audio.onerror = () => fail("This recording's metadata could not be read. Try another MP3 or WAV file.");
    audio.preload = "metadata"; audio.src = url;
  });
}
export async function importSong(file: File, context: BaseAudioContext, expectedHash?: string) {
  songMime(file.name);
  if (!file.size || file.size > MAX_SONG_BYTES) throw new Error("Choose a recording up to 100 MB.");
  return decodeSong(await file.arrayBuffer(), file.name, context, expectedHash);
}
