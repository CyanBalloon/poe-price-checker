import { vi } from "vitest";
import fs from "fs";
import path from "path";
import { Headers } from "node-fetch"; // Assuming you are using node-fetch
import { Config, TipsFrequency } from "@/web/Config";

vi.mock("@/web/Config", async () => {
  return {
    AppConfig: vi.fn(() => mockConfig),
    poeWebApi: () => "www.pathofexile.com",
    saveConfig: vi.fn(),
    TipsFrequency: {
      Always: 1,
    },
  };
});
let mockConfig: Config;
// Mock client-string-loader
vi.mock("@/assets/client-string-loader", () => ({
    loadClientStrings: vi.fn(async (lang) => {
      const basePath = path.resolve(__dirname, "../public/data/");
      const filePath = path.join(basePath, `${lang}/client_strings.js`);

      try {
        return (await import(/* @vite-ignore */ `${filePath}`)).default;
      } catch (error: unknown) {
        throw new Error(
          `Error loading client_strings.js for ${lang}: ${(error as Error).message}`,
        );
      }
    }),
    loadPoe1ClientStrings: vi.fn(async (lang) => {
      const basePath = path.resolve(__dirname, "../public/poe1-data/");
      const filePath = path.join(basePath, `${lang}/client_strings.js`);

      try {
        return (await import(/* @vite-ignore */ `${filePath}`)).default;
      } catch (error: unknown) {
        throw new Error(
          `Error loading client_strings.js for ${lang}: ${(error as Error).message}`,
        );
      }
    }),
}));

// Mock fetch
export const setupFetchMock = () => {
  // @ts-expect-error - fetch is not defined in vitest
  global.fetch = vi.fn(async (url) => {
    const basePath = path.resolve(__dirname, "../public/");
    const parsedUrl = new URL(url, 'http://localhost');
    const filePath = path.join(
      basePath,
      parsedUrl.pathname.replace(import.meta.env.BASE_URL, ""),
    );

    const createResponse = (body: unknown, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Not Found",
      headers: new Headers(),
      redirected: false,
      type: "default" as ResponseType,
      url: filePath,
      clone: () => createResponse(body, status),
      body: null,
      bodyUsed: false,
      json: async () => JSON.parse(body as string),
      text: async () => body,
      arrayBuffer: async () => {
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(body as string);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
      blob: async () => new Blob([body as string]),
      formData: async () => {
        throw new Error("formData not implemented");
      },
    });

    if (url === "/custom-icons" || url.endsWith("/custom-icons")) {
      return createResponse("{}", 200);
    }

    try {
      if (filePath.endsWith(".ndjson")) {
        const data = fs.readFileSync(filePath, "utf8");
        return createResponse(data, 200);
      }
      if (filePath.endsWith(".bin")) {
        const data = fs.readFileSync(filePath);
        return createResponse(data, 200);
      }
      if (filePath.endsWith(".json")) {
        const data = fs.readFileSync(filePath, "utf8");
        return createResponse(data, 200);
      }
    } catch {
      return createResponse(`File not found: ${filePath}`, 404);
    }

    throw new Error(`Unhandled fetch request: ${url}`);
  });
};

// Mock Host.Proxy calls
vi.mock("@/web/background/IPC", () => ({
  Host: {
    proxy: vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url.endsWith("api/trade2/data/stats") ||
        url.endsWith("api/trade2/data/items")
      ) {
        const filePath = path.resolve(__dirname, `data/${url.slice(-5)}.json`);
        const data = fs.readFileSync(filePath, "utf8");
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(data),
          text: async () => data,
        };
      }
      if (/\/api\/trade\/data\/(stats|items)$/.test(url)) {
        return new Response(JSON.stringify({ result: [] }));
      }
      return global.fetch(url, init);
    }),
    onEvent: vi.fn(() => new AbortController()),
    sendEvent: vi.fn(),
    getConfig: vi.fn(async () => null),
    importFile: vi.fn(async (file: File) => file.name),
    logs: { value: "" },
    version: { value: "0.0.00000" },
    updateInfo: { value: { state: "initial" } },
    isElectron: true,
  },
}));

export const defaultConfigMock = (overrides: Partial<Config> = {}) => {
  const defaultConfig: Config = {
    configVersion: 99999999,
    restoreClipboard: false,
    commands: [],
    clientLog: null,
    gameConfig: null,
    windowTitle: "Test Window",
    logKeys: false,
    accountName: "TestAccount",
    stashScroll: false,
    language: "en", // Default language
    game: "poe2",
    theme: "default",
    preferredTradeSite: "default",
    realm: "pc-ggg",
    widgets: [],
    fontSize: 12,
    showAttachNotification: true,
    enableAlphas: false,
    alphas: [],
    tipsFrequency: TipsFrequency.Always,
    readClientLog: false,
    autoUpdater: true,
    destroyHotkeyEnabled: false,
    autoClickerEnabled: false,
    poe1ItemAnimations: true,
  };

  mockConfig = { ...defaultConfig, ...overrides };
};

// Consolidate setup
export const setupTests = (configOverrides: Partial<Config> = {}) => {
  defaultConfigMock(configOverrides); // Pass overrides here
  setupFetchMock();
};
