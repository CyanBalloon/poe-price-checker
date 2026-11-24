import type { Server } from "http";
import { app, net } from "electron";
import type { Logger } from "./RemoteLogger";

const PROXY_HOSTS = [
  { host: "www.pathofexile.com" },
  { host: "ru.pathofexile.com" },
  { host: "pathofexile.tw" },
  { host: "poe.game.daum.net" },
  { host: "jp.pathofexile.com" },
  { host: "de.pathofexile.com" },
  { host: "es.pathofexile.com" },
  { host: "br.pathofexile.com" },
  { host: "fr.pathofexile.com" },
  { host: "web.poecdn.com", route: /^\/api\/currency-exchange\/(?:poe2\/)?\d+$/ },
  { host: "poe.ninja" },
  { host: "www.poeprices.info" },
  // me :)
  { host: "api.exiledexchange2.dev" },
];

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class HttpProxy {
  constructor(server: Server, logger: Logger) {
    server.addListener("request", (req, res) => {
      if (!req.url?.startsWith("/proxy/")) return;
      const host = req.url.split("/", 3)[2];

      const upstream = PROXY_HOSTS.find((entry) => entry.host === host);
      if (!upstream || (upstream.route &&
        (req.method !== "GET" || !upstream.route.test(req.url.slice(`/proxy/${host}`.length))))) {
        return req.destroy();
      }

      for (const key in req.headers) {
        if (
          key.startsWith("sec-") ||
          key === "host" ||
          key === "origin" ||
          key === "content-length" ||
          (upstream.route && (key === "cookie" || key === "authorization"))
        ) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete req.headers[key];
        }
      }

      const proxyReq = net.request({
        url: "https://" + req.url.slice("/proxy/".length),
        method: req.method,
        headers: {
          ...req.headers,
          "user-agent": app.userAgentFallback,
        },
        useSessionCookies: host !== "web.poecdn.com",
        referrerPolicy: "no-referrer-when-downgrade",
      });
      proxyReq.addListener("response", (proxyRes) => {
        try {
          const resHeaders = { ...proxyRes.headers };
          delete resHeaders["content-encoding"];
          res.writeHead(
            proxyRes.statusCode,
            proxyRes.statusMessage,
            resHeaders,
          );
          (proxyRes as unknown as NodeJS.ReadableStream).pipe(res);
        } catch (error) {
          logger.write(`error [proxy] ${(error as Error).message} (${host})`);
          res.destroy();
        }
      });
      proxyReq.addListener("error", (err) => {
        logger.write(`error [proxy] ${err.message} (${host})`);
        res.destroy(err);
      });

      req.pipe(proxyReq as unknown as NodeJS.WritableStream);
    });
  }
}
