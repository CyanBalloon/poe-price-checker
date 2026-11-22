import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

const executablePath = path.resolve(process.argv[2] ?? "dist/win-unpacked/PoE Price Checker.exe");
const screenshots = process.argv[3];
if (screenshots) await mkdir(screenshots, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), "poe-toolbar-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, "--no-updates"], env });
  const page = await app.firstWindow();
  const window = await app.browserWindow(page);
  const brand = page.locator(".trade-brand");
  await brand.waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const game of ["poe1", "poe2"]) {
    await page.getByRole("combobox", { name: "Game", exact: true }).selectOption(game);
    await page.locator(`.trade-shell[data-game="${game}"]`).waitFor();
    for (const width of [1600, 1280, 1080, 768, 460]) {
      await window.evaluate((win, width) => win.setContentSize(width, 720), width);
      await page.waitForFunction(width => Math.abs(innerWidth - width) <= 2, width);
      const layout = await brand.evaluate(async brand => {
        const logo = brand.querySelector("img");
        await logo.decode();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = el => el.getBoundingClientRect().toJSON();
        const controls = navigator.windowControlsOverlay;
        return {
          image: new URL(logo.currentSrc).pathname, naturalWidth: logo.naturalWidth, naturalHeight: logo.naturalHeight,
          logo: rect(logo), title: rect(brand.querySelector("span")), brand: rect(brand),
          toolbar: rect(brand.closest("header")), nav: rect(document.querySelector(".trade-navigation")),
          actions: rect(document.querySelector(".toolbar-actions")), market: rect(document.querySelector(".toolbar-market")),
          caption: controls?.visible ? controls.getTitlebarAreaRect().toJSON() : null,
        };
      });
      if (screenshots) {
        await page.screenshot({
          path: path.join(screenshots, `${game}-${width}.png`), clip: { x: 0, y: 0, width, height: 190 },
        });
      }
      const { logo, title, toolbar, nav } = layout;
      const center = rect => rect.y + rect.height / 2;
      const label = `${game} at ${width}px`;
      assert.equal(layout.image, "/images/mageblood.png", label);
      assert.equal(logo.width, layout.naturalWidth, `${label}: native belt width`);
      assert.equal(logo.height, layout.naturalHeight, `${label}: native belt height`);
      assert.equal(layout.naturalWidth, 156, label);
      assert.equal(layout.naturalHeight, 78, label);
      assert(title.width > 0 && title.left >= logo.right, `${label}: title to the right of the belt`);
      assert(Math.abs(center(title) - center(logo)) <= 2, `${label}: title and belt alignment`);
      assert(layout.brand.top >= toolbar.top && layout.brand.bottom <= toolbar.bottom, `${label}: brand outside toolbar`);
      for (const controls of [nav, layout.actions, layout.market]) {
        assert(title.right + 4 <= controls.left || layout.brand.bottom <= controls.top + 1, `${label}: brand overlaps controls`);
      }
      assert(nav.right + 4 <= layout.market.left || nav.bottom <= layout.market.top + 1, `${label}: tabs overlap market controls`);
      if (layout.caption) assert(title.right <= layout.caption.right, `${label}: title overlaps Windows controls`);
      console.log(`${label}: toolbar passed`);
    }
  }
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
