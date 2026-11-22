import { itemIconKey, type ItemIcon } from "../../../ipc/item-icons";
import type { ServerEvents } from "../server";
import { app } from "electron";
import fs from "fs/promises";
import path from "path";

export class CustomIconsStore {
  private filePath = path.join(
    app.getPath("userData"),
    "apt-data",
    "custom-icons.json",
  );

  private writes = Promise.resolve();

  constructor(server: ServerEvents) {
    server.onEventAnyClient("CLIENT->MAIN::save-custom-icon", async (payload) => {
      this.writes = this.writes.then(() => this.save(payload)).catch((error) => {
        console.error("Could not save item icon:", error);
      });
      await this.writes;
      server.sendEventTo("broadcast", {
        name: "MAIN->CLIENT::custom-icon-added",
        payload,
      });
    });
  }

  async load(): Promise<string> {
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      return contents;
    } catch {
      return "{}";
    }
  }

  private async save(icon: ItemIcon) {
    const icons: Record<string, string> = JSON.parse(await this.load());
    icons[itemIconKey(icon.game, icon.namespace, icon.refName)] = icon.iconUrl;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = this.filePath + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(icons), "utf8");
    await fs.rename(tempPath, this.filePath);
  }
}
