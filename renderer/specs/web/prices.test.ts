import { usePoeninja, type NinjaSchema } from "@/web/background/Prices";
import { Host } from "@/web/background/IPC";
import { useLeagues } from "@/web/background/Leagues";
import { expect, it, vi } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";

it("keeps PoE2 stash estimates and prices Exchange items and rates from GGG", async () => {
  const league = "Trade Test";
  setupTests({ leagueId: league });
  await init("en");

  const divine = "Metadata/Items/Currency/CurrencyModValues";
  const exalted = "Metadata/Items/Currency/CurrencyAddModToRare";
  const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
  const lineage = "Metadata/Items/Gem/SupportGemHelbrymsHide";
  const lineageQuery = { ns: "GEM", name: "Helbrym's Hide" };
  const schema: NinjaSchema = {
    schemaVersion: 1,
    map: [
      { ns: "ITEM", cx: true, url: "currency", type: "Currency" },
      { ns: "GEM", cx: true, url: "lineage-support-gems", type: "LineageSupportGems" },
      { ns: "UNIQUE", cx: false, url: "unique-armours", type: "UniqueArmours" },
    ],
  };
  const stashUnique = { name: "Tabula Rasa", variant: "Simple Robe", primaryValue: 2, detailsId: "tabula-rasa" };
  const sparkline = { totalChange: 0, data: [] };
  const proxy = vi.mocked(Host.proxy);
  proxy.mockImplementation(async input => {
    const endpoint = String(input);
    if (endpoint.endsWith("/data/leagues")) return Response.json({ result: [{ id: league, text: league }] });
    if (endpoint.startsWith("web.poecdn.com/")) {
      expect(endpoint).toMatch(/\/currency-exchange\/poe2\/\d+$/);
      return Response.json({ markets: [
        { league, market_pair: [divine, exalted], volume_traded: { [divine]: 100, [exalted]: 20000 } },
        { league, market_pair: [chaos, divine], volume_traded: { [chaos]: 1000, [divine]: 50 } },
        { league, market_pair: [exalted, lineage], volume_traded: { [exalted]: 15000, [lineage]: 150 } },
        { league, market_pair: [chaos, lineage], volume_traded: { [chaos]: 40, [lineage]: 10 } },
      ] });
    }
    if (endpoint.endsWith("/namespaceMap.json")) return Response.json(schema);
    return Response.json({
      core: { rates: { exalted: 900 } },
      itemOverviews: [
        { type: "Currency", lines: [{ name: "Orb of Alchemy", primaryValue: 1, detailsId: "orb-of-alchemy", sparkline }] },
        { type: "LineageSupportGems", lines: [{ name: lineageQuery.name, primaryValue: 15, detailsId: "helbryms-hide", sparkline }] },
        { type: "UniqueArmours", lines: [{ ...stashUnique, sparkline }] },
      ],
    });
  });
  try {
    await useLeagues().load();
    const market = usePoeninja();
    await market.forceLoad();
    expect(market.exaltedRate.value).toBe(200);
    expect(market.chaosToExalt.value).toBe(10);
    expect(market.findPriceByQuery(lineageQuery)).toMatchObject({ cx: true, primaryValue: 0.5 });
    expect(market.findPriceByQuery({ ns: "ITEM", name: "Orb of Alchemy" })).toBeNull();
    expect(market.findPriceByQuery({ ...stashUnique, ns: "UNIQUE" })).toMatchObject({ cx: false, primaryValue: 2 });
  } finally {
    proxy.mockRestore();
  }
});
