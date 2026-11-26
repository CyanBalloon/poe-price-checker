import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openArchive } from "../src/local-effects/archive.mjs";

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function bundle(bytes) {
  const step = 32, chunks = [];
  for (let i = 0; i < bytes.length; i += step) {
    // An uncompressed Oodle quantum containing only synthetic test data.
    chunks.push(Buffer.concat([Buffer.from([0xcc, 6]), bytes.subarray(i, i + step)]));
  }
  const header = Buffer.alloc(60);
  header.writeUInt32LE(bytes.length); header.writeUInt32LE(chunks.length, 36); header.writeUInt32LE(step, 40);
  return Buffer.concat([header, ...chunks.map(b => u32(b.length)), ...chunks]);
}
function ggpk(files) {
  const wide = name => Buffer.concat([...name, "\0"].map(c => u32(c.codePointAt(0))));
  function directory(name, children) {
    const data = Buffer.concat([Buffer.alloc(4), Buffer.from("PDIR"), u32(name.length + 1), u32(children.length), Buffer.alloc(32),
      wide(name), ...children.map(offset => Buffer.concat([u32(0), u64(offset)]))]);
    data.writeUInt32LE(data.length); return data;
  }
  const leaves = Object.entries(files).map(([name, bytes]) => {
    const data = Buffer.concat([Buffer.alloc(4), Buffer.from("FILE"), u32(name.length + 1), Buffer.alloc(32), wide(name), bytes]);
    data.writeUInt32LE(data.length); return data;
  });
  const rootSize = directory("", [0]).length, subAt = 28 + rootSize;
  let position = subAt + directory("Bundles2", leaves.map(() => 0)).length;
  const offsets = leaves.map(b => { const start = position; position += b.length; return start; });
  return Buffer.concat([u32(28), Buffer.from("GGPK"), u32(4), u64(28), u64(0), directory("", [subAt]), directory("Bundles2", offsets), ...leaves]);
}

function fixture(dir, offset = 19) {
  const bytes = Buffer.from(Array.from({ length: 96 }, (_, i) => i));
  const index = Buffer.concat([u32(1), u32(4), Buffer.from("test"), u32(bytes.length), u32(1),
    Buffer.from("5ec8d0eb1d2410a3", "hex"), u32(0), u32(offset), u32(bytes.length - offset), u32(0)]);
  const files = { "_.index.bin": bundle(index), "test.bundle.bin": bundle(bytes) };
  const steam = path.join(dir, "Bundles2");
  fs.mkdirSync(steam, { recursive: true });
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(steam, name), value);
  const pack = path.join(dir, "Content.ggpk");
  fs.writeFileSync(pack, ggpk(files));
  return { standalone: pack, steam: path.join(steam, "_.index.bin"), bytes };
}

test("Steam bundles and a standalone GGPK produce the same on-demand slice across chunks", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poe-archive-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { standalone, steam, bytes } = fixture(dir);
  for (const file of [standalone, steam]) {
    const archive = openArchive(file);
    try {
      assert.deepEqual(archive.read("art/test/item.dds"), bytes.subarray(19));
      assert.throws(() => archive.read("art/test/missing.dds"), /unavailable/);
    } finally { archive.close(); }
  }
});

for (const layout of ["standalone", "steam"]) {
  test(layout + " reopens without reading the game index and rebuilds on patch, replacement or damage", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poe-index-cache-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const files = fixture(dir);
    const file = files[layout];
    const cache = { directory: path.join(dir, "profile"), key: randomBytes(32) };
    let gameFd, reads;
    const open = fs.openSync, read = fs.readSync;
    t.mock.method(fs, "openSync", function (name, ...args) {
      const fd = open(name, ...args);
      if (name === file) gameFd = fd;
      return fd;
    });
    t.mock.method(fs, "readSync", function (fd, ...args) {
      if (fd === gameFd) reads++;
      return read(fd, ...args);
    });
    function check(expectedOffset, reuse) {
      reads = 0;
      const archive = openArchive(file, cache);
      try {
        assert.equal(reads === 0, reuse, "Warm opens must skip all archive index reads");
        assert.deepEqual(archive.read("art/test/item.dds"), files.bytes.subarray(expectedOffset));
      } finally { archive.close(); }
    }
    check(19, false);
    check(19, true);
    const [snapshot] = fs.readdirSync(cache.directory);
    const saved = path.join(cache.directory, snapshot);
    const damaged = fs.readFileSync(saved);
    assert(!damaged.includes(Buffer.from("test.bundle.bin")));
    damaged[damaged.length - 1] ^= 1;
    fs.writeFileSync(saved, damaged);
    check(19, false);
    check(19, true);
    cache.key = randomBytes(32);
    check(19, false);
    check(19, true);

    fixture(dir, 27);
    check(27, false);
    check(27, true);
    const stamp = fs.statSync(file);
    const replacement = file + ".new";
    fs.copyFileSync(file, replacement);
    fs.utimesSync(replacement, stamp.atime, stamp.mtime);
    fs.renameSync(replacement, file);
    check(27, false);
    check(27, true);
    assert.deepEqual(fs.readdirSync(cache.directory), [snapshot]);
    cache.directory = saved; // Simulate a profile that cannot accept a cache file.
    check(27, false);
  });
}

test("a game patch during indexing cannot publish a mixed snapshot", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poe-index-patch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { standalone } = fixture(dir);
  const cache = { directory: path.join(dir, "profile"), key: randomBytes(32) };
  openArchive(standalone, cache).close();
  const snapshot = path.join(cache.directory, fs.readdirSync(cache.directory)[0]);
  const before = fs.readFileSync(snapshot);
  fixture(dir, 27);
  fs.utimesSync(standalone, new Date(), new Date(2000));
  const stat = fs.statSync;
  const patchDuringScan = t.mock.method(fs, "statSync", function (name, ...args) {
    if (name === standalone) fs.utimesSync(name, new Date(), new Date(0));
    return stat(name, ...args);
  });
  assert.throws(() => openArchive(standalone, cache), /changed while indexing/);
  assert.deepEqual(fs.readFileSync(snapshot), before);
  patchDuringScan.mock.restore();
  openArchive(standalone, cache).close();
  assert.notDeepEqual(fs.readFileSync(snapshot), before);
  assert.equal(fs.readdirSync(cache.directory).length, 1);
});
