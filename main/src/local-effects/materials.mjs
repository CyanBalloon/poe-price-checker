import { decodeBC7 } from "tex-decoder/build/esm/bc7.js";
import { PNG } from "pngjs";

const art = "art/2dart/";
const lookups = {
  muddle: "lookup/muddle.dds", "influence-noise": "lookup/influence_noise.dds",
  "influence-mask": "uieffects/conqueroritems/iteminfluencemask.dds",
  fractal: "lookup/fractal.dds", turbulence: "lookup/turbulence.dds",
  "vestigial-muddle": "uieffects/vestigialitem/muddle_1_basic.dds", "vestigial-flow": "uieffects/vestigialitem/flow_noise_3_1.dds",
  "reliquary-sky": "uieffects/reliquaryseriestwo_sky.dds", "foil-mask": "lookup/atlas_lookup.dds",
  "wisp-dots-2": "uieffects/azmeriwoodsdust/noise_dots_2.dds", "wisp-dots-3": "uieffects/azmeriwoodsdust/noise_dots_3.dds",
};
const backgrounds = {
  "shaper-sky": "uieffects/shaperitem/bg.dds", "shaper-mask": "uieffects/shaperitem/bg_mask.dds",
  "shaper-distortion": "uieffects/shaperitem/muddle_double2.dds", "exarch-heat": "uieffects/primordials/cleansingfirebg.dds",
  "eater-current": "uieffects/primordials/tangled.dds",
};

function header(width, height, channels, levels) {
  const result = Buffer.alloc(6);
  result.writeUInt16LE(width); result.writeUInt16LE(height, 2);
  result[4] = channels; result[5] = levels;
  return result;
}

// Renderer inputs exist in memory only, including all authored mip levels and flask panels.
function dds(bytes, topOnly = false) {
  const width = bytes.readUInt32LE(16), height = bytes.readUInt32LE(12);
  const mips = Math.max(1, bytes.readUInt32LE(28));
  if (bytes.toString("ascii", 0, 4) !== "DDS " || !width || !height || width * height > 16777216 ||
      mips > 1 + Math.floor(Math.log2(Math.max(width, height)))) throw Error("Unsupported inventory texture dimensions");
  const dx = bytes.toString("ascii", 84, 88) === "DX10";
  const format = dx ? bytes.readUInt32LE(128) : 0;
  const bc7 = format === 98 || format === 99;
  const channels = format === 49 || (!dx && bytes.readUInt32LE(88) === 16) ? 2 : 4;
  const bgra = (!dx && bytes.readUInt32LE(92) === 0xff0000) || format === 87;
  if (!bc7 && ![0, 28, 29, 49, 87].includes(format)) throw Error("Unsupported inventory pixel format");
  const result = [header(width, height, channels, topOnly ? 1 : mips)];
  let offset = dx ? 148 : 128, w = width, h = height;
  for (let i = 0; i < (topOnly ? 1 : mips); i++) {
    const length = bc7 ? Math.ceil(w / 4) * Math.ceil(h / 4) * 16 : w * h * channels;
    if (offset + length > bytes.length) throw Error("Incomplete inventory mip");
    const block = bytes.subarray(offset, offset + length);
    const pixels = bc7 ? decodeBC7(block, w, h) : Buffer.from(block);
    if (bgra) for (let j = 0; j < pixels.length; j += 4) {
      const b = pixels[j]; pixels[j] = pixels[j + 2]; pixels[j + 2] = b;
    }
    result.push(pixels);
    offset += length; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  return Buffer.concat(result);
}

function foilPath(archive, index) {
  const raw = archive.read("data/relicitemeffectvariations.datc64");
  const count = raw.readUInt32LE(), tail = 4 + count * 28;
  if (index < 1 || index >= count || raw.readBigUInt64LE(tail) !== 0xbbbbbbbbbbbbbbbbn) throw Error("Unknown foil table layout");
  const offset = tail + Number(raw.readBigUInt64LE(4 + 28 * index + 16));
  let end = offset;
  while (end + 1 < raw.length && raw.readUInt16LE(end)) end += 2;
  return raw.toString("utf16le", offset, end).toLowerCase();
}

export function readMaterial(archive, key) {
  if (key.startsWith("sprite/")) {
    const sprite = key.slice(7);
    if (sprite.length > 320 || !/^2ditems\/(?:[\w. '()-]+\/)*[\w. '()-]+$/.test(sprite) || sprite.split("/").some(part => part === "." || part === "..")) throw Error("Unknown item sprite");
    return dds(archive.read("art/" + sprite + ".dds"));
  }
  if (key.startsWith("backdrop/")) {
    const name = key.slice(9);
    const elder = /^elder-(1x[34]|2x[234])-([12])(-flex)?$/.exec(name);
    const file = elder ? "uieffects/elderitem/elder" + elder[1] + "_" + elder[2] + (elder[3] ? "influence" : "") + ".dds" : backgrounds[name];
    if (typeof file !== "string") throw Error("Unknown inventory backdrop");
    const data = dds(archive.read(art + file), true);
    const width = data.readUInt16LE(), height = data.readUInt16LE(2);
    const pixels = data.subarray(6);
    if (elder?.[3] || name === "shaper-mask") {
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i + 3] = pixels[i]; pixels.fill(elder ? 0 : 255, i, i + 3);
      }
    } else if (name === "shaper-distortion") {
      // The displacement map uses RGB as a vector field, independent of texture alpha.
      for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    } else if (name === "exarch-heat") {
      for (let i = 0; i < pixels.length; i += 4) {
        const h = Math.min(1, (0.7 * pixels[i] + 0.3 * pixels[i + 1] + 0.5 * pixels[i + 2]) / 255);
        pixels[i] = Math.round(35 + 220 * h ** 0.75); pixels[i + 1] = Math.round(5 + 55 * h ** 2.8);
        pixels[i + 2] = Math.round(12 + 38 * h ** 2.1); pixels[i + 3] = Math.round(pixels[i + 3] * h ** 0.75);
      }
    }
    return PNG.sync.write({ width, height, data: pixels });
  }
  if (!key.startsWith("lookup/")) throw Error("Unknown inventory resource");
  const name = key.slice(7);
  if (/^(rosepetals[1-6]|hellscape_noise|noise_256x256)$/.test(name)) {
    const image = PNG.sync.read(archive.read(art + "lookup/png/" + name + ".png"));
    return Buffer.concat([header(image.width, image.height, 4, 1), image.data]);
  }
  const file = /^foil-(?:[1-9]|1[0-2])$/.test(name) ? foilPath(archive, Number(name.slice(5))) :
    Object.hasOwn(lookups, name) ? art + lookups[name] : undefined;
  if (!file) throw Error("Unknown inventory lookup");
  return dds(archive.read(file));
}
