import { ItemInfluence } from "@/parser/ParsedItem";
import type { InventoryEffect, InventoryFlags } from "@/parser/inventory-effects";
import type { RimInfluence } from "../influence-art";
import { itemTexture, lookupTexture } from "./textures";
import { resource } from "./local-effects";
import { linkProgram } from "./program";

type Pass = Exclude<InventoryEffect, "viscera"> | "base" | "rim-back" | "rim-front" | "viscera-back" | "viscera-surface";

const base = `#version 300 es
precision highp float;
in vec2 uv;
uniform highp sampler2D SPIRV_Cross_CombinedtexSamplerLinearClamp;
uniform vec2 spriteUV;
out vec4 colour;
void main() {
  vec4 s = texture(SPIRV_Cross_CombinedtexSamplerLinearClamp, uv * spriteUV);
  colour = vec4(s.rgb * s.a, s.a);
}`;

// The client blends additive light and premultiplied layers in linear space.
// Alpha-zero light needs coverage when exporting to an HTML transparent canvas.
const display = `#version 300 es
precision highp float;
uniform highp sampler2D scene;
out vec4 colour;
vec3 srgb(vec3 linear) {
  vec3 x = clamp(linear, 0.0, 1.0);
  return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, greaterThan(x, vec3(0.0031308)));
}
void main() {
  vec4 pixel = texelFetch(scene, ivec2(gl_FragCoord.xy), 0);
  float peak = max(pixel.r, max(pixel.g, pixel.b));
  float coverage = clamp(pixel.a, 0.0, 1.0);
  float uncovered = 1.0 - coverage;
  // Extra coverage represents light emitted beyond the sprite. Grow it
  // continuously so rounding at a saturated edge cannot switch the halo on and off.
  float excess = max(peak - coverage, 0.0);
  float a = coverage + uncovered * srgb(vec3(excess / max(uncovered, 0.000001))).x;
  colour = vec4(srgb(pixel.rgb / max(a, 0.000001)) * a, a);
}`;

const rimOrder = [ItemInfluence.Hunter, ItemInfluence.Crusader, ItemInfluence.Redeemer, ItemInfluence.Warlord] as const;
const backOrder = [ItemInfluence.Redeemer, ItemInfluence.Hunter, ItemInfluence.Warlord, ItemInfluence.Crusader] as const;
const foilPasses = ["foil", "supporter-foil", "celestial-foil"] as const;
const overlays = ["fractured", "synthesised", "replica", "scourged", "memory", "trarthan", "foulborn", "vestigial", "foreseeing"] as const;
interface Stage { pass: Pass; rim?: number }

function inventoryStages(effects: readonly InventoryEffect[], rims: readonly RimInfluence[]): Stage[] {
  const stages: Stage[] = backOrder.filter(rim => rims.includes(rim))
    .map(rim => ({ pass: "rim-back", rim: rimOrder.indexOf(rim) }));
  const viscera = effects.includes("viscera");
  const foil = foilPasses.find(pass => effects.includes(pass));
  if (viscera) stages.push({ pass: "viscera-back" }, { pass: "viscera-surface" });
  if (foil) stages.push({ pass: foil });
  if (!viscera && !foil) stages.push({ pass: "base" });

  // The client keeps one front glow. Viscera, Warlord, Hunter and Redeemer
  // take priority over Crusader. Those four multiply by a mask their front
  // material does not bind. Only Crusader adds a visible surface highlight.
  if (!viscera && rims.length === 1 && rims[0] === ItemInfluence.Crusader) stages.push({ pass: "rim-front" });
  for (const pass of overlays) {
    if (!effects.includes(pass)) continue;
    // The two supporter foil materials suppress the replica surface in game.
    if (pass === "replica" && (foil === "supporter-foil" || foil === "celestial-foil")) continue;
    stages.push({ pass });
  }
  return stages;
}
function lookupFile(name: string, pass: Pass, flags: InventoryFlags) {
  if (pass === "trarthan") {
    if (name === "turbulence_tex") return "vestigial-flow";
    if (name === "muddle_tex") return "vestigial-muddle";
    if (name === "mask_layer_0_tex") return "wisp-dots-2";
    if (name === "mask_layer_1_tex") return "wisp-dots-3";
  }
  switch (name) {
    case "muddle_tex": return pass === "vestigial" ? "vestigial-muddle" : "muddle";
    case "turbulence_tex": return pass === "vestigial" ? "vestigial-flow" : "turbulence";
    case "fractal_tex": return "fractal";
    case "influence_noise_tex": return "influence-noise";
    case "mask_tex": return pass.includes("foil") ? "foil-mask" : "influence-mask";
    case "hellscape_noise_tex": return pass === "memory" ? "noise_256x256" : "hellscape_noise";
    case "influence_layer_0_tex": return "foil-" + flags.foilVariation;
    case "influence_layer_1_tex": return "reliquary-sky";
    default:
      if (/^petal_map[1-6]$/.test(name)) return "rosepetals" + name.slice(-1);
      throw new Error("Unknown inventory shader texture " + name);
  }
}

function createDevice(revision: string) {
  const buffer = document.createElement("canvas");
  const gl = buffer.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) throw new Error("Inventory effects require WebGL 2");
  const floating = Boolean(gl.getExtension("EXT_color_buffer_float"));
  const target = gl.createTexture()!;
  const framebuffer = gl.createFramebuffer()!;
  const screen = linkProgram(gl, display);
  gl.useProgram(screen);
  gl.uniform1i(gl.getUniformLocation(screen, "scene"), 0);
  gl.disable(gl.DITHER);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const sampler = (wrap: number, filter: number) => {
    const state = gl.createSampler()!;
    gl.samplerParameteri(state, gl.TEXTURE_WRAP_S, wrap);
    gl.samplerParameteri(state, gl.TEXTURE_WRAP_T, wrap);
    gl.samplerParameteri(state, gl.TEXTURE_MIN_FILTER, filter);
    gl.samplerParameteri(state, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
    return state;
  };
  const repeat = sampler(gl.REPEAT, gl.LINEAR_MIPMAP_LINEAR);
  const clamp = sampler(gl.CLAMP_TO_EDGE, gl.LINEAR_MIPMAP_LINEAR);
  const nearest = sampler(gl.CLAMP_TO_EDGE, gl.NEAREST);

  const loadProgram = async (pass: Pass) => {
    const program = linkProgram(gl, pass === "base" ? base : new TextDecoder().decode(await resource(revision, "shader/" + pass)));
    gl.useProgram(program);
    const slots = [];
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const uniform = gl.getActiveUniform(program, i)!;
      if (uniform.type !== gl.SAMPLER_2D) continue;
      const match = /^SPIRV_Cross_Combined(.+)SamplerLinear(Clamp|Wrap)$/.exec(uniform.name);
      if (!match) throw new Error("Unknown inventory sampler " + uniform.name);
      gl.uniform1i(gl.getUniformLocation(program, uniform.name), slots.length);
      slots.push({ name: match[1], sampler: match[2] === "Clamp" ? clamp : repeat });
    }
    const location = (name: string) => gl.getUniformLocation(program, "preview." + name);
    return { program, slots, time: location("time"), seed: location("seed"), size: location("item_size"),
      uv: pass === "base" ? gl.getUniformLocation(program, "spriteUV") : location("spriteUV"),
      rim: location("rim"), scourge: location("hellscape_params") };
  };
  const programs = new Map<Pass, ReturnType<typeof loadProgram>>();
  const textures = new Map<string, Promise<WebGLTexture>>();
  let extent = { width: 0, height: 0 };
  buffer.addEventListener("webglcontextlost", () => { if (device?.gl === gl) device = undefined; }, { once: true });
  return {
    revision, gl, buffer, framebuffer, screen, target, nearest,
    program(pass: Pass) {
      const existing = programs.get(pass);
      if (existing) return existing;
      const result = loadProgram(pass);
      programs.set(pass, result);
      result.catch(() => programs.delete(pass));
      return result;
    },
    texture(file: string) {
      const existing = textures.get(file);
      if (existing) return existing;
      const result = lookupTexture(gl, revision, file);
      textures.set(file, result);
      result.catch(() => { if (textures.get(file) === result) textures.delete(file); });
      return result;
    },
    resize(width: number, height: number) {
      if (extent.width >= width && extent.height >= height) return;
      extent = { width: Math.max(extent.width, width), height: Math.max(extent.height, height) };
      buffer.width = extent.width;
      buffer.height = extent.height;
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texImage2D(gl.TEXTURE_2D, 0, floating ? gl.RGBA16F : gl.RGBA8, extent.width, extent.height,
        0, gl.RGBA, floating ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Cannot allocate the inventory surface");
    },
  };
}
let device: ReturnType<typeof createDevice> | undefined;

export async function openInventoryArt(revision: string, canvas: HTMLCanvasElement, sprite: { key: string; path: string },
  flags: InventoryFlags, effects: readonly InventoryEffect[], rims: readonly RimInfluence[],
  grid: { width: number; height: number } | undefined, signal: AbortSignal) {
  if (device && device.revision !== revision) {
    device.gl.getExtension("WEBGL_lose_context")?.loseContext();
    device = undefined;
  }
  const shared = device ??= createDevice(revision);
  const { gl } = shared;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot paint the inventory icon");
  const item = await itemTexture(gl, revision, sprite.key, signal, effects.includes("fractured"));
  const close = () => {
    gl.deleteTexture(item.texture);
    if (item.fracturedGlass) gl.deleteTexture(item.fracturedGlass.texture);
  };
  if (signal.aborted) { close(); signal.throwIfAborted(); }
  signal.addEventListener("abort", close, { once: true });
  const stages = inventoryStages(effects, rims);
  const passes = await Promise.all(stages.map(async stage => {
    const shader = await shared.program(stage.pass);
    const surface = stage.pass === "fractured" && item.fracturedGlass ? item.fracturedGlass : item;
    const inputs = await Promise.all(shader.slots.map(slot => slot.name === "tex" ? surface.texture : shared.texture(lookupFile(slot.name, stage.pass, flags))));
    return { shader, inputs, uvScale: surface.uvScale, rim: stage.rim ?? 0, fixedSeed: stage.pass === "trarthan" };
  })).catch(error => { signal.removeEventListener("abort", close); close(); throw error; });
  signal.throwIfAborted();
  const gridW = grid?.width ?? Math.max(1, Math.round(item.width / 78));
  const gridH = grid?.height ?? Math.max(1, Math.round(item.height / 78));
  const scourge = flags.scourged;
  const scorch = Math.min((scourge?.tier ?? 0) / (scourge?.isMap ? 10 : 3), 1);
  const charge = scourge?.total ? Math.min(1, (scourge.progress ?? 0) / scourge.total) : 0;
  return {
    authored: item.authored,
    draw(time: number, seed: number) {
      if (signal.aborted || gl.isContextLost()) throw new Error("Inventory scene closed");
      const { width, height } = canvas;
      shared.resize(width, height);
      gl.viewport(0, 0, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shared.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      for (const { shader, inputs, uvScale, rim, fixedSeed } of passes) {
        gl.useProgram(shader.program);
        for (let i = 0; i < inputs.length; i++) {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, inputs[i]);
          gl.bindSampler(i, shader.slots[i].sampler);
        }
        gl.uniform1f(shader.time, time);
        gl.uniform1f(shader.seed, fixedSeed ? 0 : seed);
        gl.uniform2f(shader.uv, uvScale[0], uvScale[1]);
        gl.uniform4f(shader.size, item.width, item.height, gridW, gridH);
        gl.uniform1i(shader.rim, rim);
        gl.uniform4f(shader.scourge, scorch, charge, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.BLEND);
      gl.useProgram(shared.screen);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shared.target);
      gl.bindSampler(0, shared.nearest);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(shared.buffer, 0, shared.buffer.height - height, width, height, 0, 0, width, height);
    },
  };
}
