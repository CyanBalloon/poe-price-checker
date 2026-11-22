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
    new Response(JSON.stringify({ result: [{ id: "Standard", text: "Standard" }] })),
  );
  vi.stubGlobal("document", { documentElement: { style: {} } });
  try {
    await initConfig();
    await leagues.load();
    await nextTick();

    expect(proxy).toHaveBeenCalledWith("www.pathofexile.com/api/trade/data/leagues");
    expect(leagues.selectedId.value).toBe("Standard");
    expect(leagues.selected.value?.realm).toBe("pc-garena");
    expect(market.isLoading.value).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
