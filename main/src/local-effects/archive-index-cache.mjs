import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { serialize, deserialize } from "node:v8";

const maxIndexBytes = 256 * 1024 * 1024;
const digest = text => createHash("sha256").update(text).digest("hex");

export function archiveStamp(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join("/");
}

// The snapshot holds only the lookup tables and GGPK offsets. The game's
// directory path representations and the contents of its bundles are excluded.
export function indexCache(file, stamp, { directory, key }) {
  const id = digest(process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file));
  const destination = path.join(directory, "archive-index-" + id + ".bin");
  const identity = Buffer.from(digest("poe-archive-index-v1/" + id + "/" + stamp), "hex");
  return {
    load() {
      let fd;
      try {
        fd = fs.openSync(destination, "r");
        const size = fs.fstatSync(fd).size;
        // identity (32), nonce (12), authentication tag (16), ciphertext
        if (size <= 60 || size > maxIndexBytes + 60) return;
        const header = Buffer.alloc(60);
        if (fs.readSync(fd, header) !== header.length || !header.subarray(0, 32).equals(identity)) return;
        const body = Buffer.allocUnsafe(size - header.length);
        if (fs.readSync(fd, body) !== body.length) return;
        const cipher = createDecipheriv("aes-256-gcm", key, header.subarray(32, 44));
        cipher.setAAD(identity);
        cipher.setAuthTag(header.subarray(44));
        const plaintext = cipher.update(body);
        cipher.final();
        return deserialize(plaintext);
      } catch { /* Missing, damaged or written with a different installation key. */ }
      finally { if (fd !== undefined) fs.closeSync(fd); }
    },
    save(index) {
      const temporary = destination + "." + randomUUID() + ".tmp";
      let fd;
      try {
        const plaintext = serialize(index);
        if (plaintext.length > maxIndexBytes) return;
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(identity);
        const body = cipher.update(plaintext);
        cipher.final();
        fs.mkdirSync(directory, { recursive: true });
        fd = fs.openSync(temporary, "wx", 0o600);
        fs.writeFileSync(fd, Buffer.concat([identity, iv, cipher.getAuthTag()]));
        fs.writeFileSync(fd, body);
        fs.closeSync(fd);
        fd = undefined;
        fs.renameSync(temporary, destination);
      } catch { /* An unwritable profile still supports live item effects. */ }
      finally {
        if (fd !== undefined) fs.closeSync(fd);
        try { fs.unlinkSync(temporary); } catch { /* Already renamed or never created. */ }
      }
    },
  };
}
