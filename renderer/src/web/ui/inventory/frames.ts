import { frameId } from "./local-effects";

// Cache actual GPU output, including the item composite. No shader, input texture
// or uncomposited sprite goes through the persistent-cache IPC.
export async function previewFrames(revision: string, identity: unknown[], width: number, height: number, moving: boolean, signal: AbortSignal) {
  const api = window.localItemEffects;
  if (!api || width <= 0 || height <= 0 || Math.max(width, height) > 1024) return;
  const side = moving ? Math.min(4, Math.floor(1024 / Math.max(width, height))) : 1;
  const count = side * side;
  const id = await frameId(["composite-v1", ...identity, width, height, side]);
  let image: ImageBitmap | undefined;
  const bytes = await api.frame(revision, id).catch(() => null);
  if (bytes && !signal.aborted) {
    try {
      image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      if (image.width !== width * side || image.height !== height * side || signal.aborted) { image.close(); image = undefined; }
    } catch { /* A damaged image is replaced after rendering. */ }
  }
  signal.throwIfAborted();
  signal.addEventListener("abort", () => image?.close(), { once: true });
  let sheet: HTMLCanvasElement | undefined;
  let index = 0;
  let last = -Infinity;
  return {
    ready: Boolean(image),
    paint(ctx: CanvasRenderingContext2D, time: number) {
      if (!image) return;
      const i = Math.floor(time * 30 / 1000) % count;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(image, (i % side) * width, Math.floor(i / side) * height, width, height, 0, 0, width, height);
    },
    capture(canvas: HTMLCanvasElement, now: number) {
      if (image || index >= count || now - last < 1000 / 30) return;
      if (!sheet) {
        sheet = document.createElement("canvas");
        sheet.width = width * side; sheet.height = height * side;
      }
      const ctx = sheet.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(canvas, (index % side) * width, Math.floor(index / side) * height, width, height);
      last = now;
      if (++index < count) return;
      sheet.toBlob(blob => {
        if (!blob || blob.size > 2 * 1024 * 1024) return;
        blob.arrayBuffer().then(buffer => api.saveFrame(revision, id, new Uint8Array(buffer))).catch(() => {});
      }, "image/png");
      sheet = undefined;
    },
  };
}
