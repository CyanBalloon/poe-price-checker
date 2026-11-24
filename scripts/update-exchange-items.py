"""Refresh the metadata IDs used to read GGG's Currency Exchange digests."""

import json
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "renderer/src/assets/data"
EXPORTS = {
    "poe1": "https://repoe-fork.github.io/base_items.json",
    "poe2": "https://repoe-fork.github.io/poe2/base_items.json",
}
BASE_CLASSES = {
    "AtlasCurrency", "Breachstone", "DelveSocketableCurrency",
    "DelveStackableSocketableCurrency", "Expedition2Logbooks", "ExpeditionLogbook",
    "IncubatorStackable", "LabyrinthMapItem", "Map", "MapFragment", "MapKey",
    "MiscMapItem", "Omen", "PinnacleKeyStackable", "PinnacleKey_OLD", "SoulCore",
    "StackableCurrency", "UncutReservationGemStackable", "UncutSkillGemStackable",
    "UncutSupportGemStackable", "VaultKey",
}
NAMESPACES = {"DivinationCard": "DIVINATION_CARD", "Support Skill Gem": "GEM"}


def export_exchange_items(game, url):
    with urlopen(Request(url, headers={"User-Agent": "PoE-Price-Checker"}), timeout=30) as response:
        bases = json.load(response)

    # These are possible IDs. The trade catalogue and actual market pairs determine
    # whether an item is exchange-listed. This also retains older IDs used in Standard.
    items = {}
    for item_id, base in sorted(bases.items()):
        name = base["name"]
        item_class = base["item_class"]
        if not name or (item_class not in BASE_CLASSES and item_class not in NAMESPACES):
            continue
        namespace = NAMESPACES.get(item_class)
        items[item_id] = [name, namespace] if namespace else [name]

    with (OUTPUT / f"exchange-ids-{game}.json").open("w", encoding="utf-8", newline="\n") as output:
        output.write("{\n")
        output.write(",\n".join(f"  {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}" for key, value in items.items()))
        output.write("\n}\n")
    print(f"{game}: {len(items)} item IDs")


if __name__ == "__main__":
    for game, url in EXPORTS.items():
        export_exchange_items(game, url)
