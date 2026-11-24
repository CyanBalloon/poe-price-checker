"""Add PoE1 clipboard matchers from Awakened PoE Trade and GGG's trade catalog."""

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1] / "renderer/public/poe1-data"
TRADE_HOSTS = {
    "en": "www.pathofexile.com",
    "ru": "ru.pathofexile.com",
    "cmn-Hant": "pathofexile.tw",
    "ko": None,
}
ITEM_MOD_TYPES = {"explicit", "implicit", "fractured", "crafted", "enchant", "scourge", "sanctum", "imbued"}


def download(url):
    with urlopen(Request(url, headers={"User-Agent": "PoE-Price-Checker"}), timeout=30) as response:
        return response.read().decode("utf-8")


def stat_records(text):
    for line in text.split("\n"):
        if line.strip():
            row = json.loads(line)
            yield from row.get("stats", [row])


def trade_ids(stat):
    return frozenset(
        trade_id for kind, group in stat["trade"]["ids"].items() if kind != "pseudo"
        for trade_id in group
    )


def encoded(stat):
    return json.dumps(stat, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def update_language(language, revision):
    file = ROOT / language / "stats.ndjson"
    original = file.read_bytes().decode("utf-8")
    upstream = download(
        f"https://raw.githubusercontent.com/SnosMe/awakened-poe-trade/{revision}"
        f"/renderer/public/data/{language}/stats.ndjson"
    )
    exact = set()
    by_ids = defaultdict(list)
    by_id = defaultdict(list)
    known = set()
    added = []

    def index(stat):
        exact.add(encoded(stat))
        ids = trade_ids(stat)
        by_ids[ids].append(stat)
        for kind, group in stat["trade"]["ids"].items():
            for trade_id in group:
                by_id[trade_id].append(stat)
            for matcher in stat["matchers"]:
                for key in ("string", "advanced"):
                    if key in matcher:
                        known.add((kind, matcher[key]))

    def add(stat):
        if encoded(stat) in exact:
            return
        index(stat)
        added.append(stat)

    for stat in stat_records(original):
        index(stat)

    for stat in stat_records(upstream):
        if encoded(stat) in exact:
            continue
        ids = trade_ids(stat)
        same = by_ids.get(ids, []) if ids else []
        # Keep established refs and pseudo totals when GGG only changes the wording.
        if len({s["ref"] for s in same}) == 1:
            before = same[0]
            if before["trade"].get("option") == stat["trade"].get("option"):
                stat = {**stat, "ref": before["ref"], "trade": {
                    **stat["trade"], "ids": {**before["trade"]["ids"], **stat["trade"]["ids"]},
                }}
        add(stat)

    upstream_added = len(added)
    host = TRADE_HOSTS[language]
    if host:
        catalog = json.loads(download(f"https://{host}/api/trade/data/stats"))["result"]
        candidates = defaultdict(set)
        for group in catalog:
            kind = group["id"]
            if kind not in ITEM_MOD_TYPES:
                continue
            for entry in group["entries"]:
                if "option" in entry:
                    continue
                text = entry["text"].replace("+#", "#").replace("\u200b", "")
                candidates[kind, text].add(entry["id"])
                plain = re.sub(r" \((?:Local|Global)\)$", "", text) if language == "en" else text
                candidates[kind, plain].add(entry["id"])

        for (kind, text), ids in sorted(candidates.items()):
            if (kind, text) in known or len(ids) != 1 or not text:
                continue
            trade_id = next(iter(ids))
            same = by_id.get(trade_id, [])
            source = same[0] if len({s["ref"] for s in same}) == 1 and not same[0]["trade"].get("option") else None
            trade = {"ids": {kind: [trade_id]}}
            if source:
                trade = {**source["trade"], "ids": {**source["trade"]["ids"], **trade["ids"]}}
            add({
                **(source or {"ref": text, "better": 1}),
                "matchers": [{"string": text}],
                "trade": trade,
            })

    if added:
        ending = "\r\n" if original.count("\r\n") > original.count("\n") / 2 else "\n"
        with file.open("ab") as output:
            if original and not original.endswith("\n"):
                output.write(ending.encode())
            output.write("".join(encoded(stat) + ending for stat in added).encode("utf-8"))
    print(f"{language}: {upstream_added} Awakened records, {len(added) - upstream_added} GGG records added")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision", help="Awakened PoE Trade Git revision to import")
    args = parser.parse_args()
    with ThreadPoolExecutor() as executor:
        list(executor.map(lambda lang: update_language(lang, args.revision), TRADE_HOSTS))
