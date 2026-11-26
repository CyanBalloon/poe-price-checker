import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import asar from "@electron/asar";
import { withOffscreenApp } from "./offscreen-app.mjs";

const executable = path.resolve(process.argv[2] ?? "dist/win-unpacked/PoE Price Checker.exe");
const profile = await mkdtemp(path.join(os.tmpdir(), "poe-offscreen-effects-"));
const fractured = "Item Class: Rings\nRarity: Rare\nEntropy Grip\nPaua Ring\n--------\nItem Level: 85\n--------\nFractured Item";
const hunter = "Item Class: Staves\nRarity: Normal\nImperial Staff\n--------\nItem Level: 85\n--------\nHunter Item";
const flask = "Item Class: Utility Flasks\nRarity: Magic\nBismuth Flask\n--------\nItem Level: 85\n--------\nFractured Item";
const circle = "Item Class: Rings\nRarity: Unique\nCircle of Fear\nSapphire Ring\n--------\nItem Level: 85\n--------\nSynthesised Item";

async function enter(page, item) {
  await page.getByRole("button", { name: "Paste item", exact: true }).first().click();
  await page.locator("#trade-item-clipboard").fill(item);
  await page.getByRole("button", { name: "Check item", exact: true }).click();
  await page.mouse.move(0, 0);
}
async function setup(page) {
  await page.route("**/proxy/**", route => route.fulfill({ status: 503, body: "" }));
  await page.route("https://**/*", route => route.fulfill({ status: 503, body: "" }));
  // The game archive supplies every pixel drawn to the animation canvas.
  // Give the ordinary catalogue image a predictable layout without using the network.
  await page.route("https://web.poecdn.com/**/*.png*", route => {
    const h = /staff6/i.test(route.request().url()) ? 188 : /bismuth/i.test(route.request().url()) ? 94 : 47;
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="47" height="' + h + '"/>' });
  });
  await page.route(/\/api\/trade2?\/data\/leagues/, route => route.fulfill({ json: { result: [{ id: "Standard", text: "Standard", realm: "pc" }] } }));
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "readText", { value: async () => "" }));
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("poe1");
  const status = await page.evaluate(() => window.localItemEffects.status());
  assert(status.revision && status.folder, "A local PoE1 installation is required for this integration check");
  return status;
}
async function motion(page, text, effects) {
  await enter(page, text);
  const canvas = page.locator('.checked-art .inventory-art[data-renderer="shader"][data-effects="' + effects + '"] canvas').first();
  try {
    await canvas.waitFor({ timeout: 30000 });
  } catch (error) {
    const state = await page.locator(".checked-art").evaluateAll(items => items.map(item => ({
      renderer: item.querySelector(".inventory-art")?.dataset.renderer,
      effects: item.querySelector(".inventory-art")?.dataset.effects,
      image: item.querySelector(".item-art")?.getAttribute("src"),
    })));
    throw new Error("No live preview for " + text.split("\n")[2] + ": " + JSON.stringify(state), { cause: error });
  }
  const changes = await canvas.evaluate(async c => {
    let previous, changes = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      const pixels = new Uint32Array(c.getContext("2d").getImageData(0, 0, c.width, c.height).data.buffer);
      if (!pixels.some(p => p >>> 24 > 60)) throw Error("Empty animation");
      if (previous && pixels.some((p, n) => p !== previous[n])) changes++;
      previous = pixels;
    }
    return changes;
  });
  assert.equal(await canvas.evaluate(c => getComputedStyle(c.closest(".influenced-item-art").querySelector(".item-art")).visibility), "hidden");
  assert(changes >= 7, "Expected moving " + effects + " artwork, saw " + changes + " changes");
}
async function until(test) {
  const end = Date.now() + 10000;
  do { if (await test()) return; await new Promise(r => setTimeout(r, 100)); } while (Date.now() < end);
  assert.fail("Timed out waiting for a completed, encrypted frame strip");
}

try {
  const asarPath = path.join(path.dirname(executable), "resources", "app.asar");
  assert(!asar.listPackage(asarPath).some(n => /[\\/]inventory[\\/]shaders|[\\/]images[\\/]poe1[\\/](inventory|influences)[\\/]|\.hlsl$|\.dds$/.test(n)));
  await withOffscreenApp(executable, async ({ app, page }) => {
    const actualProfile = await app.evaluate(({ app }) => app.getPath("userData"));
    assert.equal(path.resolve(actualProfile), profile);
    await setup(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await motion(page, hunter, "");
    await motion(page, fractured, "fractured");
    await motion(page, flask, "fractured");
    await motion(page, circle, "synthesised");
    await page.route("https://web.poecdn.com/**/Staff6.png*", route => route.abort());
    await motion(page, hunter, "");
    await page.locator('.checked-art img.item-art[src^="blob:"]').waitFor({ state: "attached" });
    const root = path.join(profile, "local-item-effects");
    const [folder] = await readdir(root);
    const db = new DatabaseSync(path.join(root, folder, "previews.sqlite"), { readOnly: true });
    try {
      // Give the animation time to finish collecting its frames before changing motion mode.
      await until(() => db.prepare("SELECT count(*) AS n FROM previews").get().n > 0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await enter(page, fractured);
      await page.locator('.checked-art .inventory-art[data-effects="fractured"][data-renderer="shader"] img').first().waitFor();
      await until(async () => {
        for (const row of db.prepare("SELECT id, sealed FROM previews").all()) {
          const [, , revision, id] = row.id.split("/");
          const bytes = await page.evaluate(async ([revision, id]) => {
            const png = await window.localItemEffects.frame(revision, id);
            return png && Array.from(png.subarray(0, 24));
          }, [revision, id]);
          assert(bytes && Buffer.from(bytes).readUInt32BE(0) === 0x89504e47);
          assert(!Buffer.from(row.sealed).includes(Buffer.from(bytes)));
          if (Buffer.from(bytes).readUInt32BE(16) === 47 && Buffer.from(bytes).readUInt32BE(20) === 47) return true;
        }
        return false;
      });
      assert(db.prepare("SELECT length(wrapped) AS n FROM vault").get().n > 32);
    } finally { db.close(); }
  }, profile);
  const cacheRoot = path.join(profile, "local-item-effects");
  const [install] = await readdir(cacheRoot);
  const cacheDirectory = path.join(cacheRoot, install);
  const snapshots = (await readdir(cacheDirectory)).filter(name => /^archive-index-[a-f0-9]{64}\.bin$/.test(name));
  assert.equal(snapshots.length, 1);
  const snapshot = path.join(cacheDirectory, snapshots[0]);
  const beforeRestart = await stat(snapshot, { bigint: true });
  await withOffscreenApp(executable, async ({ page }) => {
    await setup(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enter(page, fractured);
    await page.locator('.checked-art .inventory-art[data-renderer="cache"][data-effects="fractured"] img').first().waitFor({ timeout: 12000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await motion(page, hunter, "");
    const afterRestart = await stat(snapshot, { bigint: true });
    assert.equal(afterRestart.ino, beforeRestart.ino, "Restart replaced the archive index");
    assert.equal(afterRestart.mtimeNs, beforeRestart.mtimeNs, "Restart rewrote the archive index");
    await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("poe2");
    await page.locator('.trade-shell[data-game="poe2"]').waitFor();
    await page.locator(".inventory-art").first().waitFor({ state: "detached" });
  }, profile);
  console.log("Packaged app passed live motion, encrypted previews, archive index reuse across restart and PoE2 switching.");
} finally {
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
