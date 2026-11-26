import { resource } from "./local-effects";

// The client pads its mipmaps to DDS block boundaries. Its visible inventory
// sprite uses 78 pixels per grid cell even when the allocation is 80 pixels.
function visibleExtent(padded: number) {
  const extent = Math.round(padded / 78) * 78;
  return extent > 0 && Math.ceil(extent / 4) * 4 === padded ? extent : padded;
}

function texture(gl: WebGL2RenderingContext, bytes: Uint8Array, colour: boolean) {
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = head.getUint16(0, true);
  const height = head.getUint16(2, true);
  const channels = bytes[4];
  const levels = bytes[5];
  const format = channels === 4 ? gl.RGBA : channels === 2 ? gl.RG : gl.RED;
  const internal = colour ? gl.SRGB8_ALPHA8 : channels === 4 ? gl.RGBA8 : channels === 2 ? gl.RG8 : gl.R8;
  const handle = gl.createTexture();
  if (!handle) throw Error("Cannot create local inventory texture");
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage2D(gl.TEXTURE_2D, levels, internal, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
  let offset = 6;
  let w = width;
  let h = height;
  for (let i = 0; i < levels; i++) {
    const next = offset + w * h * channels;
    gl.texSubImage2D(gl.TEXTURE_2D, i, 0, 0, w, h, format, gl.UNSIGNED_BYTE, bytes.subarray(offset, next));
    offset = next;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  return { texture: handle, width, height, authored: levels > 1, uvScale: [1, 1] as readonly number[] };
}
export async function lookupTexture(gl: WebGL2RenderingContext, rev: string, name: string) {
  return texture(gl, await resource(rev, "lookup/" + name), false).texture;
}

export async function itemTexture(gl: WebGL2RenderingContext, rev: string, key: string, signal: AbortSignal, fractured: boolean) {
  const bytes = await resource(rev, "sprite/" + key);
  signal.throwIfAborted();
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = head.getUint16(0, true);
  const height = head.getUint16(2, true);
  // Three inventory panels are padded to DDS block width; tinctures have one panel.
  const panel = height / 2;
  if (!key.startsWith("2ditems/flasks/") || !Number.isInteger(panel) || Math.abs(width - 3 * panel) > 3) {
    const visibleWidth = visibleExtent(width);
    const visibleHeight = visibleExtent(height);
    return { ...texture(gl, bytes, true), width: visibleWidth, height: visibleHeight,
      uvScale: [visibleWidth / width, visibleHeight / height], fracturedGlass: undefined };
  }
  const bottle = baseCanvas(bytes, key);
  const handle = gl.createTexture();
  if (!handle) throw Error("Cannot create flask surface");
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.texStorage2D(gl.TEXTURE_2D, 1 + Math.floor(Math.log2(height)), gl.SRGB8_ALPHA8, panel, height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bottle);
  gl.generateMipmap(gl.TEXTURE_2D);
  const glass = fractured ? texture(gl, bytes, true) : undefined;
  const fracturedGlass = glass && { ...glass, width: panel, uvScale: [panel / width, 1] };
  return { texture: handle, width: panel, height, uvScale: [1, 1], authored: false, fracturedGlass };
}

function baseCanvas(bytes: Uint8Array, key: string) {
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = head.getUint16(0, true);
  const height = head.getUint16(2, true);
  const raw = new OffscreenCanvas(width, height);
  const pixels = new Uint8ClampedArray(bytes.subarray(6, 6 + width * height * 4));
  raw.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
  const panel = height / 2;
  if (!key.startsWith("2ditems/flasks/") || !Number.isInteger(panel) || Math.abs(width - 3 * panel) > 3) {
    const w = visibleExtent(width);
    const h = visibleExtent(height);
    if (w === width && h === height) return raw;
    const cropped = new OffscreenCanvas(w, h);
    cropped.getContext("2d")!.drawImage(raw, 0, 0);
    return cropped;
  }
  const bottle = new OffscreenCanvas(panel, height);
  const ctx = bottle.getContext("2d")!;
  for (const layer of [1, 2, 0]) ctx.drawImage(raw, panel * layer, 0, panel, height, 0, 0, panel, height);
  return bottle;
}

export async function localBaseIcon(revision: string, key: string, grid?: { width: number; height: number }) {
  const source = baseCanvas(await resource(revision, "sprite/" + key), key);
  const extent = grid ? new OffscreenCanvas(grid.width * 47, grid.height * 47) : source;
  if (extent !== source) extent.getContext("2d")!.drawImage(source, 0, 0, extent.width, extent.height);
  return extent.convertToBlob({ type: "image/png" });
}
