import { nextTick } from "vue";
import { expect, it, vi } from "vitest";
import { AppConfig, defaultConfig, initConfig } from "@/web/Config";
import { Host } from "@/web/background/IPC";
import { useLeagues } from "@/web/background/Leagues";
import { usePoeninja } from "@/web/background/Prices";

vi.unmock("@/web/Config");
vi.mock("@/web/overlay/widget-registry.js", () => ({
  registry: {
    widgets: [{
      widget: {
        instances: "single",
        initInstance: () => ({ wmType: "price-check", coreCurrency: "chaos" }),
      },
    }],
  },
}));

it("starts the market watcher before config loads and uses the saved game afterward", async () => {
  const proxy = vi.mocked(Host.proxy);
  const leagues = useLeagues();
  const market = usePoeninja();

  expect(leagues.list.value).toEqual([]);
  expect(leagues.selected.value).toBeUndefined();
  expect(AppConfig("price-check")).toBeUndefined();
  await leagues.load();
  expect(proxy).not.toHaveBeenCalled();

  const config = { ...defaultConfig(), game: "poe1", realm: "pc-garena" };
  vi.mocked(Host.getConfig).mockResolvedValueOnce(JSON.stringify(config));
  proxy.mockResolvedValueOnce(
    new Response(JSON.stringify({ result: [
      { id: "Challenge", text: "Challenge", realm: "pc" },
      { id: "Hardcore Challenge", text: "Hardcore Challenge", realm: "pc" },
      { id: "Ruthless Challenge", text: "Ruthless Challenge", realm: "pc" },
      { id: "Challenge", text: "Challenge", realm: "xbox" },
    ] })),
  );
  vi.stubGlobal("document", { documentElement: { style: {} } });
  try {
    await initConfig();
    await leagues.load();
    await nextTick();

    expect(proxy).toHaveBeenCalledWith("www.pathofexile.com/api/trade/data/leagues");
    expect(leagues.list.value.map((league) => league.id)).toEqual([
      "Challenge", "Hardcore Challenge", "Ruthless Challenge",
    ]);
    expect(leagues.selectedId.value).toBe("Challenge");
    expect(leagues.selected.value?.realm).toBe("pc-garena");
    expect(market.isLoading.value).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps the auto-clicker off on upgrade and restores an explicit opt-in on restart", async () => {
  const current = defaultConfig();
  expect(current.autoClickerEnabled).toBe(false);
  vi.stubGlobal("document", { documentElement: { style: {} } });
  try {
    const old = { ...current, configVersion: 33, autoClickerEnabled: undefined };
    vi.mocked(Host.getConfig).mockResolvedValueOnce(JSON.stringify(old));
    await initConfig();
    expect(AppConfig().autoClickerEnabled).toBe(false);
    expect(AppConfig().configVersion).toBe(current.configVersion);

    vi.mocked(Host.getConfig).mockResolvedValueOnce(JSON.stringify({ ...current, autoClickerEnabled: true }));
    await initConfig();
    expect(AppConfig().autoClickerEnabled).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
