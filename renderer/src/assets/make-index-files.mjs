// @ts-check

import fnv1a from "@sindresorhus/fnv1a";
import fs from "fs";
import path from "path";

const LANGUAGES = ["en", "ru", "cmn-Hant", "ko", "ja", "de", "es", "pt", "fr"];
const DIRS = ["./public/data", "./public/poe1-data"];

for (const dataDir of DIRS) {
for (const lang of LANGUAGES) {
  const lineStarts = {
    /** @type{Array<{ hash: number, start: number }>} */
    statsByRef: [],
    /** @type{Array<{ hash: number, start: number }>} */
    matchers: [],
  };

  {
    const filePath = `${dataDir}/${lang}/stats.ndjson`;
    if (!fs.existsSync(filePath)) continue;
    const ndjson = fs.readFileSync(filePath, {
      encoding: "utf-8",
    });
    let start = 0;
    while (start < ndjson.length) {
      const end = ndjson.indexOf("\n", start);
      const sliceEnd = end === -1 ? ndjson.length : end;
      const line = ndjson.slice(start, sliceEnd).trim();
      if (line) {
        const statOrGroup = JSON.parse(line);
        const stats = statOrGroup.stats ? statOrGroup.stats : [statOrGroup];
        for (const stat of stats) {
          lineStarts.statsByRef.push({
            start,
            hash: Number(fnv1a(stat.ref, { size: 32 })),
          });
          for (const matcher of stat.matchers) {
            lineStarts.matchers.push({
              start,
              hash: Number(fnv1a(matcher.string, { size: 32 })),
            });
            if (matcher.advanced) {
              lineStarts.matchers.push({
                start,
                hash: Number(fnv1a(matcher.advanced, { size: 32 })),
              });
            }
          }
        }
      }
      start = end === -1 ? ndjson.length : end + 1;
    }
  }

  {
    const indexData = new Uint32Array(lineStarts.statsByRef.length * 2);
    lineStarts.statsByRef.sort((a, b) => a.hash - b.hash);
    for (let i = 0; i < lineStarts.statsByRef.length; i += 1) {
      indexData[i * 2 + 0] = lineStarts.statsByRef[i].hash;
      indexData[i * 2 + 1] = lineStarts.statsByRef[i].start;
    }
    fs.writeFileSync(
      path.join(dataDir, lang, "stats-ref.index.bin"),
      indexData,
    );
  }

  {
    const indexData = new Uint32Array(lineStarts.matchers.length * 2);
    lineStarts.matchers.sort((a, b) => a.hash - b.hash);
    for (let i = 0; i < lineStarts.matchers.length; i += 1) {
      indexData[i * 2 + 0] = lineStarts.matchers[i].hash;
      indexData[i * 2 + 1] = lineStarts.matchers[i].start;
    }
    fs.writeFileSync(
      path.join(dataDir, lang, "stats-matcher.index.bin"),
      indexData,
    );
  }
}
}

for (const dataDir of DIRS) {
for (const lang of LANGUAGES) {
  /** @type{Array<{ hashName: number, hashRefName: number, start: number }>} */
  let lineStarts;
  {
    const filePath = `${dataDir}/${lang}/items.ndjson`;
    if (!fs.existsSync(filePath)) continue;
    const ndjson = fs.readFileSync(filePath, {
      encoding: "utf-8",
    });
    let start = 0;
    /** @type{Map<string, typeof lineStarts[number]>} */
    const startsByName = new Map();
    while (start < ndjson.length) {
      const end = ndjson.indexOf("\n", start);
      const sliceEnd = end === -1 ? ndjson.length : end;
      const line = ndjson.slice(start, sliceEnd).trim();
      if (line) {
        /** @type {import('./data/interfaces').BaseType} */
        const item = JSON.parse(line);
        const key = `${item.namespace}::${item.refName}`;
        if (!startsByName.has(key)) {
          startsByName.set(key, {
            hashName: Number(
              fnv1a(`${item.namespace}::${item.name}`, { size: 32 }),
            ),
            hashRefName: Number(
              fnv1a(`${item.namespace}::${item.refName}`, { size: 32 }),
            ),
            start: start,
          });
        }
      }
      start = end === -1 ? ndjson.length : end + 1;
    }
    lineStarts = Array.from(startsByName.values());
  }

  {
    const indexData = new Uint32Array(lineStarts.length * 2);
    lineStarts.sort((a, b) => a.hashName - b.hashName);
    for (let i = 0; i < lineStarts.length; i += 1) {
      indexData[i * 2 + 0] = lineStarts[i].hashName;
      indexData[i * 2 + 1] = lineStarts[i].start;
    }
    fs.writeFileSync(
      path.join(dataDir, lang, "items-name.index.bin"),
      indexData,
    );
  }

  {
    const indexData = new Uint32Array(lineStarts.length * 2);
    lineStarts.sort((a, b) => a.hashRefName - b.hashRefName);
    for (let i = 0; i < lineStarts.length; i += 1) {
      indexData[i * 2 + 0] = lineStarts[i].hashRefName;
      indexData[i * 2 + 1] = lineStarts[i].start;
    }
    fs.writeFileSync(
      path.join(dataDir, lang, "items-ref.index.bin"),
      indexData,
    );
  }
}
}
