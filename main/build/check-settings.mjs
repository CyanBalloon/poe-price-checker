import assert from "node:assert/strict";
import path from "node:path";
import { withOffscreenApp } from "./offscreen-app.mjs";

const executable = path.resolve(process.argv[2] ?? "dist/win-unpacked/PoE Price Checker.exe");
const screenshot = process.argv[3];
const hunterStaff = "Item Class: Staves\nRarity: Normal\nImperial Staff\n--------\nItem Level: 85\n--------\nHunter Item";

await withOffscreenApp(executable, async ({ page, window: nativeWindow }) => {
  let events;
  await page.routeWebSocket("**/events", socket => {
    socket.connectToServer();
    events = socket;
  });
  await page.route("**/proxy/**", route => route.fulfill({ status: 503, body: "" }));
  await page.route("https://**/*", route => route.fulfill({ status: 503, body: "" }));
  await page.route("https://web.poecdn.com/**/*.png*", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="47" height="188"/>',
  }));
  await page.route(/\/api\/trade2?\/data\/leagues/, route => route.fulfill({
    json: { result: [{ id: "Standard", text: "Standard", realm: "pc" }] },
  }));
  await page.addInitScript(() => Object.defineProperty(navigator.clipboard, "readText", { value: async () => "" }));
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.waitFor();
  await page.reload();
  const game = page.getByRole("combobox", { name: "Game", exact: true });
  const animations = page.getByRole("switch", { name: "PoE 1 item animations" });
  const tips = page.getByRole("tooltip");
  async function checkBackground() {
    const main = page.locator(".trade-main--settings");
    await main.waitFor();
    assert.equal(await main.getByRole("group", { name: "Settings background" }).count(), 0);
    const url = await main.evaluate(el => getComputedStyle(el).backgroundImage.match(/url\("([^"]+)"\)/)?.[1]);
    assert.equal(new URL(url).pathname, "/images/settings/atlas-observatory.webp");
    await page.evaluate(async url => {
      const art = new Image();
      art.src = url;
      await art.decode();
    }, url);
  }
  await game.selectOption("poe1");
  await settings.click();
  assert.equal(await page.locator(".trade-settings h2").first().textContent(), "Application");
  assert.equal(await animations.getAttribute("aria-checked"), "true");
  await checkBackground();
  const info = page.getByRole("button", { name: "About PoE 1 item animations" });
  await info.hover();
  await tips.waitFor();
  await page.mouse.move(0, 0);
  await tips.waitFor({ state: "hidden" });
  await info.focus();
  await tips.waitFor();
  await info.press("Escape");
  await tips.waitFor({ state: "hidden" });
  for (const width of [520, 1280]) {
    await nativeWindow.evaluate((win, w) => win.setContentSize(w, 1000), width);
    await page.waitForFunction(w => Math.abs(innerWidth - w) <= 2, width);
    const overflow = await page.locator(".trade-main").evaluate(main => {
      if (main.scrollWidth <= main.clientWidth + 1) return [];
      return Array.from(main.querySelectorAll("*")).filter(el => el.getBoundingClientRect().right > main.clientWidth + 1)
        .slice(0, 12).map(el => [el.className, el.getBoundingClientRect().right, main.clientWidth, main.scrollWidth]);
    });
    assert.deepEqual(overflow, [], `Settings overflow at ${width}px: ${JSON.stringify(overflow)}`);
    const sections = await page.locator(".settings-columns > section").evaluateAll(nodes => nodes.map(node => {
      const { x, y } = node.getBoundingClientRect();
      return { x, y };
    }));
    if (width === 520) assert(sections[1].y > sections[0].y && sections[1].x === sections[0].x);
    else assert(sections[1].x > sections[0].x && sections[1].y === sections[0].y);
  }
  if (screenshot) {
    events.send(JSON.stringify({ name: "MAIN->CLIENT::updater-state", payload: { state: "initial" } }));
    await page.getByRole("button", { name: "Check for updates" }).waitFor();
    await page.getByRole("heading", { name: "Settings", exact: true }).click();
    await page.locator(".trade-main").evaluate(el => el.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: screenshot });
  }
  await animations.click();
  await page.getByRole("button", { name: "Choose folder" }).waitFor({ state: "hidden" });
  // Existing profiles may still contain a choice saved by the previous build.
  await page.route("**/config", async route => {
    const host = await (await route.fetch()).json();
    const config = JSON.parse(host.contents);
    config.settingsArtwork = "waypoint";
    await route.fulfill({ json: { ...host, contents: JSON.stringify(config) } });
  }, { times: 1 });
  await page.reload();
  await settings.click();
  assert.equal(await animations.getAttribute("aria-checked"), "false");
  await checkBackground();
  await page.getByRole("button", { name: "Price Check", exact: true }).click();
  await page.getByRole("button", { name: "Paste item", exact: true }).first().click();
  await page.locator("#trade-item-clipboard").fill(hunterStaff);
  await page.getByRole("button", { name: "Check item", exact: true }).click();
  const art = page.locator(".checked-art").first();
  await art.locator("img.item-art").first().waitFor();
  assert.equal(await art.locator(".influenced-item-art, .inventory-art").count(), 0);
  const hasGame = await page.evaluate(async () => Boolean((await window.localItemEffects.status()).revision));
  await settings.click();
  await animations.click();
  await page.getByRole("button", { name: "Price Check", exact: true }).click();
  if (hasGame) {
    await art.locator('.inventory-art[data-renderer="shader"] canvas').first().waitFor({ timeout: 120000 });
  }
  await settings.click();
  await animations.click();
  assert.equal(await art.locator(".influenced-item-art, .inventory-art").count(), 0);
  await game.selectOption("poe2");
  await settings.click();
  await animations.waitFor({ state: "hidden" });
  await checkBackground();
  // Start from an installation that predates the item animation preference.
  await page.route("**/config", async route => {
    const response = await route.fetch();
    const host = await response.json();
    const config = JSON.parse(host.contents);
    config.configVersion = 34;
    config.game = "poe1";
    delete config.poe1ItemAnimations;
    delete config.settingsArtwork;
    await route.fulfill({ json: { ...host, contents: JSON.stringify(config) } });
  });
  await page.reload();
  await settings.click();
  assert.equal(await animations.getAttribute("aria-checked"), "true");
  await checkBackground();
  console.log("Settings passed layout, tooltip, fixed Atlas background, persistence, migration, static art and game switching." +
    (hasGame ? " Confirmed the installed game powered a live shader after re-enabling." : ""));
});
