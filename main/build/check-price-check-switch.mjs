import assert from "node:assert/strict";
import { once } from "node:events";
import path from "node:path";
import WebSocket from "ws";
import { withOffscreenApp } from "./offscreen-app.mjs";

const exe = path.resolve(process.argv[2] ?? "dist/win-unpacked/PoE Price Checker.exe");
await withOffscreenApp(exe, async ({ page, window: nativeWindow }) => {
  let events;
  let saves = 0, ownEchoes = 0;
  await page.routeWebSocket("**/events", socket => {
    const upstream = socket.connectToServer();
    socket.onMessage(message => {
      if (JSON.parse(message).name === "CLIENT->MAIN::save-config") saves++;
      upstream.send(message);
    });
    upstream.onMessage(message => {
      if (JSON.parse(message).name === "MAIN->CLIENT::config-changed") ownEchoes++;
      socket.send(message);
    });
    events = socket;
  });
  await page.route("**/proxy/**", route => route.fulfill({ status: 503, body: "" }));
  await page.route("https://**/*", route => route.fulfill({ status: 503, body: "" }));
  await page.route(/\/api\/trade2?\/data\/leagues/, route => route.fulfill({
    json: { result: [{ id: "Standard", text: "Standard", realm: "pc" }] },
  }));
  await page.reload();
  const observer = new WebSocket(new URL("/events", page.url().replace(/^http/, "ws")));
  let otherUpdates = 0;
  observer.on("message", data => {
    if (JSON.parse(data.toString()).name === "MAIN->CLIENT::config-changed") otherUpdates++;
  });
  await once(observer, "open");
  for (const [game, itemClass, base] of [["poe1", "Staves", "Imperial Staff"], ["poe2", "Bows", "Rider Bow"]]) {
    await page.getByRole("combobox", { name: "Game", exact: true }).selectOption(game);
    await page.locator('.trade-shell[data-game="' + game + '"]').waitFor();
    async function check(name, locked) {
      const clipboard = ["Item Class: " + itemClass, "Rarity: Rare", name, base, "--------", "Item Level: 80"].join("\n");
      events.send(JSON.stringify({ name: "MAIN->CLIENT::item-text",
        payload: { target: "price-check", activeGame: game, focusOverlay: locked, position: { x: 20, y: 20 }, clipboard } }));
      try {
        await page.getByRole("heading", { name, exact: true }).waitFor({ timeout: 12000 });
      } catch (error) {
        const visible = await page.locator("main").innerText();
        throw new Error(game + " did not display " + name + ": " + visible.slice(0, 800), { cause: error });
      }
    }
    await check("Doom Reach", false);
    const brand = await page.locator(".trade-brand span").boundingBox();
    assert(brand);
    await nativeWindow.evaluate((win, rect) => {
      const contents = win.webContents;
      const counts = { paints: 0, blank: 0 };
      function paint(_event, _dirty, image) {
        const scale = image.getSize().width / win.getContentSize()[0];
        const title = image.crop({ x: Math.round(rect.x * scale), y: Math.round(rect.y * scale),
          width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) }).toBitmap();
        let letters = 0;
        for (let i = 0; i < title.length; i += 4) {
          if (title[i + 3] > 128 && title[i + 1] > 140) letters++;
        }
        counts.paints++;
        if (letters < 10) counts.blank++;
      }
      contents.on("paint", paint);
      win.finishPaintCheck = () => { contents.off("paint", paint); return counts; };
      contents.invalidate();
    }, brand);
    await page.evaluate(() => {
      const panel = document.querySelector(".price-results");
      const toolbar = document.querySelector(".trade-toolbar");
      const sample = { frames: 0, blank: 0, request: 0 };
      function frame() {
        sample.frames++;
        if (!toolbar.checkVisibility() || !panel.checkVisibility() ||
            !panel.querySelector(".checked-identity h2")?.checkVisibility()) sample.blank++;
        sample.request = requestAnimationFrame(frame);
      }
      window.checkSamples = sample;
      frame();
    });
    for (const [i, name] of ["Havoc Reach", "Rune Reach", "Viper Reach", "Doom Reach"].entries()) {
      await check(name, i % 2 === 0);
    }
    await page.waitForTimeout(650);
    const sample = await page.evaluate(() => {
      cancelAnimationFrame(window.checkSamples.request);
      return window.checkSamples;
    });
    assert(sample.frames > 2);
    assert.equal(sample.blank, 0, game + " showed a blank price-check frame");
    const pixels = await nativeWindow.evaluate(win => win.finishPaintCheck());
    assert(pixels.paints > 0, "Expected compositor output");
    assert.equal(pixels.blank, 0, game + " produced a blank window paint");
    console.log(game + ": four consecutive item switches, " + sample.frames + " layout samples, " +
      pixels.paints + " compositor paints, zero blank frames.");
  }
  assert(saves > 0, "Expected the checker to save the game change");
  assert.equal(ownEchoes, 0, "The sender received its own older configuration");
  assert(otherUpdates > 0, "A second client should still receive the new configuration");
  observer.close();
});
