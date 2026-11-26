import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

interface KeyProtection {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
}

const maxEntry = 2 * 1024 * 1024;
const limit = 64 * 1024 * 1024;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function validFrame(bytes: Buffer) {
  return bytes.length > 32 && bytes.length <= maxEntry && bytes.subarray(0, 8).equals(png) &&
    bytes.toString("ascii", 12, 16) === "IHDR" && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 1024 &&
    bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 1024;
}

// The sole persistent asset representation is a finished, composited preview.
// All inputs used to render it stay in the game installation or process memory.
export class PreviewCache {
  private db: DatabaseSync;
  private key: Buffer;

  constructor(directory: string, private installation: string, protection: KeyProtection) {
    if (!protection.isEncryptionAvailable()) throw Error("Windows key protection unavailable");
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "previews.sqlite"));
    try {
      this.db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS vault (id INTEGER PRIMARY KEY CHECK(id=1), wrapped BLOB NOT NULL); CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, touched INTEGER NOT NULL, sealed BLOB NOT NULL); BEGIN IMMEDIATE");
      const row = this.db.prepare("SELECT wrapped FROM vault WHERE id=1").get();
      let key: Buffer | undefined;
      if (row) {
        try {
          const [scope, hex] = protection.decryptString(Buffer.from(row.wrapped as Uint8Array)).split("/");
          if (scope === installation && /^[a-f0-9]{64}$/.test(hex ?? "")) key = Buffer.from(hex, "hex");
        } catch { /* An exported profile or lost Windows key requires a fresh cache. */ }
      }
      if (!key) {
        key = randomBytes(32);
        const value = installation + "/" + key.toString("hex");
        const wrapped = protection.encryptString(value);
        if (protection.decryptString(wrapped) !== value) throw Error("Windows key protection unavailable");
        this.db.prepare("INSERT OR REPLACE INTO vault(id,wrapped) VALUES(1,?)").run(wrapped);
        this.db.exec("DELETE FROM previews");
      }
      this.key = key;
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.close(); // SQLite rolls back an unfinished transaction.
      throw error;
    }
  }

  archiveIndexKey() {
    return createHmac("sha256", this.key).update("poe/archive-index/v1").digest();
  }

  private identity(revision: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(revision)) throw Error("Invalid preview identity");
    return "frame-v1/" + this.installation + "/" + revision + "/" + id;
  }

  get(revision: string, id: string) {
    const identity = this.identity(revision, id);
    const row = this.db.prepare("SELECT sealed FROM previews WHERE id=?").get(identity);
    if (!row) return;
    const bytes = Buffer.from(row.sealed as Uint8Array);
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(identity));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const frame = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
      if (!validFrame(frame)) throw Error("Invalid cached frame");
      this.db.prepare("UPDATE previews SET touched=? WHERE id=?").run(Date.now(), identity);
      return frame;
    } catch {
      this.db.prepare("DELETE FROM previews WHERE id=?").run(identity);

    }
  }

  put(revision: string, id: string, frame: Buffer) {
    const identity = this.identity(revision, id);
    if (!validFrame(frame)) throw Error("Only rendered PNG previews can be cached");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(identity));
    const ciphertext = Buffer.concat([cipher.update(frame), cipher.final()]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT OR REPLACE INTO previews(id,touched,sealed) VALUES(?,?,?)").run(identity, Date.now(), sealed);
      this.db.prepare("DELETE FROM previews WHERE id IN (SELECT id FROM (SELECT id, SUM(length(sealed)) OVER (ORDER BY touched DESC, rowid DESC) AS bytes FROM previews) WHERE bytes > ?)").run(limit);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() { this.key.fill(0); this.db.close(); }
}
