import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import esbuild from "esbuild";
import { PNG } from "pngjs";

const source = new URL("../src/local-effects/preview-cache.ts", import.meta.url);
const compiled = await esbuild.transform(readFileSync(source, "utf8"), { loader: "ts", format: "esm" });
const { PreviewCache } = await import("data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64"));
const hash = s => createHash("sha256").update(s).digest("hex");
const rev = hash("installed game build"), id = hash("fractured flask"), scope = hash("installation");
const image = PNG.sync.write({ width: 32, height: 32, data: randomBytes(32 * 32 * 4) });

function profile(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "poe-cache-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function fakeWindows() {
  const user = new Map();
  return { isEncryptionAvailable: () => true, encryptString(value) {
    const handle = randomBytes(32);
    user.set(handle.toString("hex"), value);
    return handle;
  }, decryptString(handle) {
    const result = user.get(handle.toString("hex"));
    if (!result) throw Error("Different test user");
    return result;
  } };
}

test("only sealed frames survive restart, with fresh nonces and authenticated item and game identities", t => {
  const dir = profile(t), protection = fakeWindows();
  const cache = new PreviewCache(dir, scope, protection);
  const indexKey = cache.archiveIndexKey();
  const db = new DatabaseSync(path.join(dir, "previews.sqlite"));
  const sealed = () => Buffer.from(db.prepare("SELECT sealed FROM previews LIMIT 1").get().sealed);
  cache.put(rev, id, image);
  const first = sealed();
  cache.put(rev, id, image);
  assert(!sealed().subarray(0, 12).equals(first.subarray(0, 12)));
  assert(!sealed().includes(image.subarray(32, 100)));
  assert.deepEqual(cache.get(rev, id), image);
  cache.close();
  const warm = new PreviewCache(dir, scope, protection);
  assert.deepEqual(warm.archiveIndexKey(), indexKey);
  assert.deepEqual(warm.get(rev, id), image);
  assert.equal(warm.get(hash("patched game"), id), undefined);
  const secondId = hash("different item");
  db.prepare("UPDATE previews SET id=?").run("frame-v1/" + scope + "/" + rev + "/" + secondId);
  assert.equal(warm.get(rev, secondId), undefined);
  warm.put(rev, id, image);
  const damaged = sealed(); damaged[damaged.length - 1] ^= 1;
  db.prepare("UPDATE previews SET sealed=?").run(damaged);
  assert.equal(warm.get(rev, id), undefined);
  assert.throws(() => warm.put(rev, id, Buffer.from("DDS shader source")));
  assert.throws(() => warm.put(rev, "../bad", image));
  db.close(); warm.close();
});

test("installations have independent keys and the cache fails closed when Windows protection is unavailable", t => {
  const owner = fakeWindows(), a = profile(t), b = profile(t);
  const ka = [];
  const inspectProtection = { ...owner, encryptString: value => { ka.push(value.split("/")[1]); return owner.encryptString(value); } };
  const one = new PreviewCache(a, scope, inspectProtection);
  const two = new PreviewCache(b, hash("second install"), inspectProtection);
  assert.notEqual(ka[0], ka[1]);
  assert.notDeepEqual(one.archiveIndexKey(), two.archiveIndexKey());
  assert.notEqual(one.archiveIndexKey().toString("hex"), ka[0]);
  one.put(rev, id, image); one.close(); two.close();
  assert.throws(() => new PreviewCache(a, scope, { ...owner, isEncryptionAvailable: () => false }));
  const valid = new PreviewCache(a, scope, owner);
  assert.deepEqual(valid.get(rev, id), image); valid.close();
  const copied = new PreviewCache(a, scope, fakeWindows());
  assert.equal(copied.get(rev, id), undefined);
  copied.put(rev, id, image); assert.deepEqual(copied.get(rev, id), image);
  copied.close();
});
