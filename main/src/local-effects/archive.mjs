import fs from "node:fs";
import path from "node:path";
import { readIndexBundle, getFileInfo } from "pathofexile-dat/bundles.js";
import { decompressUnsafe } from "ooz-wasm";
import { archiveStamp, indexCache } from "./archive-index-cache.mjs";

const maxBundle = 256 * 1024 * 1024;

function read(fd, position, length) {
  if (!Number.isSafeInteger(position) || position < 0 || length < 0 || length > maxBundle) throw Error("Invalid game archive extent");
  const bytes = Buffer.alloc(length);
  if (fs.readSync(fd, bytes, 0, length, position) !== length) throw Error("The game archive changed while reading");
  return bytes;
}

// Follow only the Bundles2 directory records. Game file contents are never extracted to disk.
function ggpkLocations(fd) {
  const header = read(fd, 0, 20);
  const version = header.readUInt32LE(8);
  if (header.toString("ascii", 4, 8) !== "GGPK" || ![2, 3, 4].includes(version)) throw Error("Unsupported PoE1 archive");
  const width = version === 4 ? 4 : 2;
  function record(at) {
    const head = read(fd, at, 16);
    const size = head.readUInt32LE();
    const tag = head.toString("ascii", 4, 8);
    const chars = head.readUInt32LE(8);
    if (!["FILE", "PDIR"].includes(tag) || chars > 1024) throw Error("Invalid game directory entry");
    const directory = tag === "PDIR";
    const start = at + (directory ? 48 : 44);
    const bytes = read(fd, start, chars * width);
    const name = width === 2 ? bytes.toString("utf16le").replace(/\0$/, "") :
      Array.from({ length: Math.max(0, chars - 1) }, (_, i) => String.fromCodePoint(bytes.readUInt32LE(i * 4))).join("");
    const data = start + bytes.length;
    if (!directory) return { name, data, size: at + size - data };
    const count = head.readUInt32LE(12);
    if (count > 100000 || data + count * 12 > at + size) throw Error("Invalid game directory size");
    const entries = read(fd, data, count * 12);
    return { name, children: Array.from({ length: count }, (_, i) => Number(entries.readBigUInt64LE(i * 12 + 4))) };
  }
  const root = record(Number(header.readBigUInt64LE(12)));
  const directory = root.children.map(record).find(entry => entry.name.toLowerCase() === "bundles2");
  if (!directory?.children) throw Error("PoE1 bundle directory missing");
  const locations = new Map();
  function walk(entries, prefix, depth) {
    if (depth > 20) throw Error("Invalid bundle directory depth");
    for (const offset of entries) {
      const entry = record(offset);
      const key = prefix + entry.name.toLowerCase();
      if (entry.children) walk(entry.children, key + "/", depth + 1);
      else if (key.endsWith(".bin")) locations.set(key, { data: entry.data, size: entry.size });
    }
  }
  walk(directory.children, "", 0);
  return locations;
}

function slice(bundle, offset = 0, size = bundle.readUInt32LE(0)) {
  const total = bundle.readUInt32LE(0), count = bundle.readUInt32LE(36), step = bundle.readUInt32LE(40);
  if (!step || step > 8 * 1024 * 1024 || count !== Math.ceil(total / step) || size > maxBundle || size < 0 || offset < 0 || offset + size > total)
    throw Error("Invalid PoE1 bundle size");
  const output = Buffer.alloc(size);
  let position = 60 + count * 4;
  for (let i = 0; i < count; i++) {
    const compressed = bundle.readUInt32LE(60 + i * 4);
    if (position + compressed > bundle.length) throw Error("Incomplete PoE1 bundle");
    const begin = i * step, end = Math.min(total, begin + step);
    const lo = Math.max(begin, offset), hi = Math.min(end, offset + size);
    if (lo < hi) {
      const chunk = decompressUnsafe(bundle.subarray(position, position + compressed), end - begin);
      output.set(chunk.subarray(lo - begin, hi - begin), lo - offset);
    }
    position += compressed;
    if (end >= offset + size) break;
  }
  return output;
}

export function openArchive(file, cacheOptions) {
  const fd = fs.openSync(file, "r");
  try {
    const standalone = path.basename(file).toLowerCase() === "content.ggpk";
    const stat = fs.fstatSync(fd, { bigint: true });
    const stamp = archiveStamp(stat);
    const cache = cacheOptions && indexCache(file, stamp, cacheOptions);
    let index = cache?.load();
    const locations = index?.locations ?? (standalone ? ggpkLocations(fd) : undefined);
    function load(name) {
      if (standalone) {
        const entry = locations.get(name.toLowerCase());
        if (!entry) throw Error("Missing PoE1 bundle");
        return read(fd, entry.data, entry.size);
      }
      if (!/^[\w./ -]+\.bin$/i.test(name) || name.split("/").some(part => !part || part === "." || part === "..")) throw Error("Invalid bundle name");
      const bundle = path.join(path.dirname(file), name);
      if (fs.statSync(bundle).size > maxBundle) throw Error("Oversized game bundle");
      return fs.readFileSync(bundle);
    }
    const reused = Boolean(index);
    if (!index) {
      const bytes = standalone ? load("_.index.bin") : read(fd, 0, Number(stat.size));
      const { bundlesInfo, filesInfo } = readIndexBundle(slice(bytes));
      index = { bundlesInfo, filesInfo, locations };
    }
    // A patcher can replace the file or edit it in place during a long cold scan.
    if (archiveStamp(fs.statSync(file, { bigint: true })) !== stamp) throw Error("The game archive changed while indexing");
    if (!reused) cache?.save(index);
    let lastName, lastBundle;
    return {
      read(name) {
        const entry = getFileInfo(name, index.bundlesInfo, index.filesInfo);
        if (!entry) throw Error("PoE1 asset unavailable: " + name);
        if (entry.bundle !== lastName) {
          lastBundle = load(entry.bundle);
          lastName = entry.bundle;
        }
        return slice(lastBundle, entry.offset, entry.size);
      },
      close() { fs.closeSync(fd); },
    };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
