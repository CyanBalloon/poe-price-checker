const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { stat, writeFile } = require("node:fs/promises");
const path = require("node:path");

exports.afterAllArtifactBuild = async ({ artifactPaths }) => {
  const portable = artifactPaths.find(file => /^poe-price-checker-\d.*\.exe$/.test(path.basename(file)));
  if (!portable) return [];
  const url = path.basename(portable);
  const version = url.slice("poe-price-checker-".length, -".exe".length);
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(portable)) hash.update(chunk);
  const sha512 = hash.digest("base64");
  const size = (await stat(portable)).size;
  const manifest = path.join(path.dirname(portable), "portable.yml");
  // JSON is valid YAML and keeps filenames quoted for electron-updater.
  await writeFile(manifest, JSON.stringify({
    version, files: [{ url, sha512, size }], path: url, sha512, releaseDate: new Date().toISOString()
  }, null, 2) + "\n");
  return [manifest];
};
