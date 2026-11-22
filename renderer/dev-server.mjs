import { createServer } from "vite";

const vite = await createServer({
  server: { host: "127.0.0.1" },
});

process.once("disconnect", () => void vite.close());
if (process.connected) {
  await vite.listen();
  if (process.connected) process.send(vite.resolvedUrls.local[0]);
} else {
  await vite.close();
}
