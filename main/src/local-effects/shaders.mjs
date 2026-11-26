import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { passes, bindings, conquerors } from "./shader-bindings.mjs";

function definitions(archive) {
  const result = new Map();
  for (const file of ["include/util.hlsl", "include/itemeffects.hlsl", "include/oetf.hlsl", "draw2d.hlsl"]) {
    const source = archive.read("shaders/" + file).toString("utf8").replace(/^\uFEFF/, "").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const signature = /^(?:static\s+|inline\s+)?(?:float\d?(?:x\d)?|int\d?|uint\d?|bool|void|InterpNodes2|struct)\s+(\w+)\s*(?:\(|\{)/gm;
    for (const match of source.matchAll(signature)) {
      const start = source.indexOf("{", match.index);
      if (start < 0 || source.slice(match.index, start).includes(";")) continue;
      let end = start + 1, depth = 1;
      while (end < source.length && depth) {
        const c = source[end++];
        if (c === "{") depth++;
        else if (c === "}") depth--;
      }
      if (depth) throw Error("Unsupported inventory shader syntax");
      let body = source.slice(match.index, end);
      if (body.startsWith("struct ")) body += ";";
      body = body.replace(/\/(\s*)(base_color|outline_color|fill_color)\.a\b/g, "/$1max($2.a, 1e-8f)");
      const list = result.get(match[1]) ?? [];
      list.push(body);
      result.set(match[1], list);
    }
  }
  result.delete("VS_OUTPUT");
  return result;
}

function shaderInput(key, defs) {
  const names = (key === "rim-back" ? conquerors : [passes[key]]).map(name => "PShad_" + name);
  const seen = new Set(), selected = [];
  function add(name) {
    if (seen.has(name)) return;
    seen.add(name);
    const bodies = defs.get(name);
    if (!bodies) throw Error("Missing inventory shader entry " + name);
    for (const body of bodies) for (const word of body.match(/\b\w+\b/g) ?? []) if (defs.has(word)) add(word);
    selected.push(...bodies);
  }
  names.forEach(add);
  const entry = names.slice(0, -1).map((name, n) => "if (rim == " + n + ") return " + name + "(item);").join("\n");
  return bindings + selected.join("\n") + "\nfloat4 main(float2 uv : TEXCOORD0) : SV_Target0 { VS_OUTPUT item;" +
    "item.texture_uv = uv * spriteUV; item.sat_scale_localuv = float4(1,1,uv); item.colour = 1;" +
    entry + "\nreturn " + names.at(-1) + "(item);}";
}

async function run(tool, args, input) {
  const child = spawn(tool, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 20000 });
  const output = [], errors = [];
  child.stdout.on("data", chunk => output.push(chunk));
  child.stderr.on("data", chunk => errors.push(chunk));
  child.stdin.on("error", () => { /* close reports the compiler failure */ });
  const closed = once(child, "close");
  child.stdin.end(input);
  const [code] = await closed;
  if (code !== 0) throw Error(path.basename(tool) + " could not translate this effect: " + Buffer.concat(errors).toString().slice(0, 220));
  return Buffer.concat(output);
}

async function translate(tools, key, source) {
  // glslang accepts a named output pipe on Windows. Neither HLSL nor intermediate
  // SPIR-V is ever written to a temporary file.
  const pipe = "\\\\.\\pipe\\poe-effect-" + randomUUID();
  let socket;
  const server = net.createServer();
  const finished = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("connection", connection => {
      socket = connection;
      const chunks = [];
      connection.on("data", data => chunks.push(data));
      connection.once("error", reject);
      connection.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
  // Attach the error handler before starting the compiler.
  finished.catch(() => {});
  server.listen(pipe);
  await once(server, "listening");
  const noOptimise = ["rim-back", "rim-front", "viscera-back"].includes(key);
  let deadline;
  try {
    const compiler = run(path.join(tools, "glslangValidator.exe"), ["--stdin", "-D", "-V", noOptimise ? "-Od" : "-Os",
      "--auto-map-locations", "--auto-map-bindings", "-S", "frag", "-e", "main", "-o", pipe], source);
    const timeout = new Promise((_, fail) => { deadline = setTimeout(() => fail(Error("Inventory compiler timed out")), 22000); });
    const [binary] = await Promise.race([Promise.all([finished, compiler]), timeout]);
    const glsl = await run(path.join(tools, "spirv-cross.exe"), ["-", "--es", "--version", "300", "--glsl-emit-ubo-as-plain-uniforms"], binary);
    const text = glsl.toString("utf8");
    if (!text.startsWith("#version 300 es")) throw Error("Invalid translated inventory shader");
    const variable = /uniform Preview (\w+);/.exec(text);
    return variable ? text.replace(new RegExp("\\b" + variable[1] + "\\b", "g"), "preview") : text;
  } finally {
    clearTimeout(deadline);
    socket?.destroy();
    server.close();
  }
}

export function shaderReader(archive, tools) {
  let defs;
  const compiled = new Map();
  return async key => {
    if (key !== "rim-back" && !Object.hasOwn(passes, key)) throw Error("Unknown effect pass");
    if (!compiled.has(key)) {
      defs ??= definitions(archive);
      const result = translate(tools, key, shaderInput(key, defs)).catch(error => { compiled.delete(key); throw error; });
      compiled.set(key, result);
    }
    return Buffer.from(await compiled.get(key));
  };
}
