import { parentPort, workerData } from "node:worker_threads";
import { openArchive } from "./archive.mjs";
import { shaderReader } from "./shaders.mjs";
import { readMaterial } from "./materials.mjs";

const archive = openArchive(workerData.file, workerData.indexCache);
const shader = shaderReader(archive, workerData.tools);
parentPort.on("message", async ({ id, key }) => {
  try {
    const bytes = key.startsWith("shader/") ? await shader(key.slice(7)) : readMaterial(archive, key);
    // Transfer a dedicated buffer. Never transfer Node's pooled backing store.
    const data = Uint8Array.from(bytes);
    parentPort.postMessage({ id, data }, [data.buffer]);
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
parentPort.once("close", () => archive.close());
