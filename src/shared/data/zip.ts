import { Inflate, zipSync } from "fflate";
export type ZipPolicy = {
  label: string; maxArchive: number; maxExpanded: number; maxFiles: number;
  required: string[]; limitFor: (name: string) => number;
};
const mb = (bytes: number) => bytes / 1024 / 1024;
function packPath(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,119}$/.test(name) || name.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Archive paths must be relative, without traversal or URLs.");
  }
  return name;
}
const decoder = new TextDecoder("utf-8", { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const checksum = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const bad = (): never => { throw new Error("Invalid or unsupported ZIP archive."); };
type Entry = { name: string; method: number; crc: number; size: number; compressed: number; start: number; header: number };

/** Validate the central directory and matching local headers before inflation.
 * Nothing is extracted to a filesystem, and declared sizes are not trusted. */
function entries(data: Uint8Array, policy: ZipPolicy): Entry[] {
  if (data.length > policy.maxArchive) throw new Error(`${policy.label} pack exceeds ${mb(policy.maxArchive)} MB.`);
  if (data.length < 22) bad();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (p: number) => view.getUint16(p, true), u32 = (p: number) => view.getUint32(p, true);
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== data.length)) end--;
  if (end < Math.max(0, data.length - 65557)) bad();
  const count = u16(end + 10), directory = u32(end + 16), length = u32(end + 12);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || !count || count > policy.maxFiles || directory + length !== end) bad();
  const result: Entry[] = [], names = new Set<string>(); let cursor = directory, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) bad();
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16);
    const compressed = u32(cursor + 20), size = u32(cursor + 24), nameLength = u16(cursor + 28);
    const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32), header = u32(cursor + 42);
    if (next > end || flags & ~0x080e || (method !== 0 && method !== 8) || u16(cursor + 34)) bad();
    const name = packPath(decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength)));
    if (!policy.limitFor(name) || size > policy.limitFor(name) || names.has(name.toLowerCase())) throw new Error(`${policy.label} ZIP contains an unsupported, duplicate or oversized file.`);
    if ((expanded += size) > policy.maxExpanded) throw new Error(`Expanded ${policy.label.toLowerCase()} exceeds ${mb(policy.maxExpanded)} MB.`);
    names.add(name.toLowerCase());
    if (header + 30 > directory || u32(header) !== 0x04034b50 || u16(header + 6) !== flags || u16(header + 8) !== method) bad();
    const localLength = u16(header + 26), start = header + 30 + localLength + u16(header + 28);
    if (start + compressed > directory || decoder.decode(data.subarray(header + 30, header + 30 + localLength)) !== name) bad();
    if (!(flags & 8) && (u32(header + 14) !== crc || u32(header + 18) !== compressed || u32(header + 22) !== size)) bad();
    if (method === 0 && compressed !== size) bad();
    result.push({ name, method, crc, compressed, size, header, start }); cursor = next;
  }
  if (cursor !== end || policy.required.some(name => !names.has(name))) bad();
  const sorted = [...result].sort((a, b) => a.header - b.header);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].header < sorted[i - 1].start + sorted[i - 1].compressed) bad();
  return result;
}

/** Called in a terminable worker. Small compressed chunks bound transient output. */
export function unpackZip(data: Uint8Array, policy: ZipPolicy): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = Object.create(null);
  for (const entry of entries(data, policy)) {
    const bytes = data.subarray(entry.start, entry.start + entry.compressed);
    const output = new Uint8Array(entry.size); let written = 0;
    if (entry.method === 0) { output.set(bytes); written = bytes.length; }
    else {
      const inflate = new Inflate(chunk => {
        if (written + chunk.length > entry.size) throw new Error(`${policy.label} expands beyond its declared size.`);
        output.set(chunk, written); written += chunk.length;
      });
      if (!bytes.length) bad();
      for (let offset = 0; offset < bytes.length; offset += 1024) inflate.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
    }
    if (written !== entry.size || checksum(output) !== entry.crc) throw new Error(`${policy.label} file failed its size or checksum check.`);
    files[entry.name] = output;
  }
  return files;
}

export function packZip(files: Record<string, Uint8Array>, policy: ZipPolicy): Uint8Array {
  const names = Object.keys(files), unique = new Set<string>(); let size = 22, expanded = 0;
  if (!names.length || names.length > policy.maxFiles || policy.required.some(name => !names.includes(name))) bad();
  // Validate before zipSync allocates a combined output buffer.
  for (const name of names) {
    packPath(name); const bytes = files[name], limit = policy.limitFor(name);
    if (!(bytes instanceof Uint8Array) || !limit || bytes.length > limit || unique.has(name.toLowerCase())) {
      throw new Error(`${policy.label} ZIP contains an unsupported, duplicate or oversized file.`);
    }
    unique.add(name.toLowerCase()); expanded += bytes.length; size += bytes.length + 76 + name.length * 2;
  }
  if (expanded > policy.maxExpanded || size > policy.maxArchive) throw new Error(`${policy.label} pack exceeds ${mb(policy.maxArchive)} MB.`);
  return zipSync(files, { level: 0 });
}
