const http = require("node:http");
const os = require("node:os");

const productionMappings = Object.freeze([
  Object.freeze({
    listenPort: 18080,
    targetPort: 38080,
    hostname: "formulario.rodogarcia.com.br",
    kind: "frontend",
  }),
  Object.freeze({
    listenPort: 18081,
    targetPort: 28081,
    hostname: "api-formulario.rodogarcia.com.br",
    kind: "api",
  }),
]);
const allowedHosts = Object.freeze({
  frontend: "formulario.rodogarcia.com.br",
  api: "api-formulario.rodogarcia.com.br",
});
const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function countRawHeader(request, name) {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i].toLowerCase() === name) count += 1;
  }
  return count;
}

function validOriginPath(path, kind) {
  if (
    typeof path !== "string" ||
    path.length > 8192 ||
    !path.startsWith("/") ||
    /[^\x21-\x7e]|[\\#]/.test(path)
  )
    return false;
  const pathOnly = path.split("?", 1)[0];
  if (pathOnly.includes("//")) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return false;
  }
  if (
    /[\x00-\x20\x7f\\#]/.test(decoded) ||
    decoded.includes("//") ||
    decoded.split("/").some((part) => part === "." || part === "..")
  )
    return false;
  if (/%(?:00|0a|0d|5c|7f)/i.test(path)) return false;
  return (
    kind === "frontend" ||
    (decoded.startsWith("/api/v1/") && pathOnly.startsWith("/api/v1/"))
  );
}

function endToEndHeaders(headers) {
  const excluded = new Set(hopByHop);
  for (const token of String(headers.connection || "").split(",")) {
    if (token.trim()) excluded.add(token.trim().toLowerCase());
  }
  const result = Object.create(null);
  for (const [name, value] of Object.entries(headers)) {
    if (!excluded.has(name.toLowerCase()) && value !== undefined)
      result[name] = value;
  }
  return result;
}

function finish(request, response, status, location) {
  const headers = {
    "content-length": "0",
    "cache-control": "no-store",
    connection: "close",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (location) headers.location = location;
  response.writeHead(status, headers);
  response.end();
  request.resume();
}

function createLoopbackBridge({ listenPort, targetPort, hostname, kind }) {
  if (
    !Number.isInteger(listenPort) ||
    listenPort < 0 ||
    listenPort > 65535 ||
    !Number.isInteger(targetPort) ||
    targetPort < 1 ||
    targetPort > 65535 ||
    allowedHosts[kind] !== hostname
  )
    throw new Error("Mapeamento de ponte recusado.");
  const sockets = new Set();
  const upstreamRequests = new Set();
  const server = http.createServer({
    maxHeaderSize: 16384,
    insecureHTTPParser: false,
  });

  function handle(request, response, expectsContinue = false) {
    if (
      request.socket.remoteAddress !== "127.0.0.1" ||
      countRawHeader(request, "host") !== 1 ||
      !validOriginPath(request.url, kind)
    )
      return finish(request, response, 400);
    const host = request.headers.host;
    const protoCount = countRawHeader(request, "x-forwarded-proto");
    const protocol = request.headers["x-forwarded-proto"];
    const localHost = `127.0.0.1:${server.address().port}`;
    const probePath = kind === "frontend" ? "/" : "/api/v1/auth/csrf";
    const localProbe =
      host === localHost &&
      protoCount === 0 &&
      (request.method === "GET" || request.method === "HEAD") &&
      request.url === probePath;
    if (!localProbe) {
      if (
        host !== hostname ||
        protoCount !== 1 ||
        !["http", "https"].includes(protocol)
      ) {
        return finish(request, response, 400);
      }
      // Cloudflare overwrites X-Forwarded-Proto with the visitor's protocol.
      // Trust is limited to this loopback origin; it is not cryptographic PID attestation.
      // https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-proto
      if (protocol === "http")
        return finish(
          request,
          response,
          308,
          `https://${hostname}${request.url}`,
        );
    }
    const allowedMethods =
      kind === "frontend"
        ? ["GET", "HEAD", "OPTIONS"]
        : ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
    if (!allowedMethods.includes(request.method))
      return finish(request, response, 405);
    const headers = endToEndHeaders(request.headers);
    delete headers.expect;
    delete headers.forwarded;
    delete headers["x-forwarded-host"];
    delete headers["x-forwarded-port"];
    if (localProbe) {
      headers.host = `127.0.0.1:${targetPort}`;
      delete headers["x-forwarded-proto"];
    } else {
      headers.host = hostname;
      headers["x-forwarded-proto"] = "https";
      headers["x-forwarded-host"] = hostname;
      headers["x-forwarded-port"] = "443";
    }
    let upstream;
    try {
      upstream = http.request(
        {
          host: "127.0.0.1",
          port: targetPort,
          path: request.url,
          method: request.method,
          headers,
          agent: false,
          maxHeaderSize: 16384,
          insecureHTTPParser: false,
        },
        (origin) => {
          if (response.destroyed) {
            origin.destroy();
            return;
          }
          try {
            response.writeHead(
              origin.statusCode,
              endToEndHeaders(origin.headers),
            );
          } catch {
            origin.destroy();
            response.destroy();
            return;
          }
          origin.on("error", () => response.destroy());
          origin.on("aborted", () => response.destroy());
          origin.pipe(response);
        },
      );
    } catch {
      return finish(request, response, 502);
    }
    upstreamRequests.add(upstream);
    upstream.once("close", () => upstreamRequests.delete(upstream));
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on("error", () => {
      if (!response.headersSent && !response.destroyed)
        finish(request, response, 502);
      else response.destroy();
    });
    request.on("aborted", () => upstream.destroy());
    request.on("error", () => upstream.destroy());
    response.on("close", () => {
      if (!response.writableFinished) upstream.destroy();
    });
    if (expectsContinue) response.writeContinue();
    request.pipe(upstream);
  }

  server.on("request", (request, response) => handle(request, response));
  server.on("checkContinue", (request, response) =>
    handle(request, response, true),
  );
  server.on("checkExpectation", (request, response) =>
    finish(request, response, 417),
  );
  server.on("connect", (_request, socket) =>
    socket.end(
      "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    ),
  );
  server.on("upgrade", (_request, socket) =>
    socket.end(
      "HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    ),
  );
  server.on("clientError", (_error, socket) => {
    if (socket.writable)
      socket.end(
        "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
    else socket.destroy();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setTimeout(120000, () => socket.destroy());
  });
  server.maxConnections = 200;
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(
          { host: "127.0.0.1", port: listenPort, exclusive: true },
          () => {
            server.removeListener("error", onError);
            resolve(server.address());
          },
        );
      }),
    close: () =>
      new Promise((resolve) => {
        for (const upstream of upstreamRequests) upstream.destroy();
        for (const socket of sockets) socket.destroy();
        if (server.listening) server.close(() => resolve());
        else resolve();
      }),
  };
}

async function startLoopbackBridges(mappings) {
  const bridges = [];
  try {
    for (const mapping of mappings) {
      const bridge = createLoopbackBridge(mapping);
      bridges.push(bridge);
      await bridge.listen();
    }
    return {
      bridges,
      close: () => Promise.all(bridges.map((bridge) => bridge.close())),
    };
  } catch (error) {
    await Promise.all(bridges.map((bridge) => bridge.close()));
    throw error;
  }
}

function checkOrigin(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: "127.0.0.1", port, path, agent: false, timeout: 3000 },
      (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else reject(new Error("Origem local sem HTTP 200."));
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("Timeout da origem local.")),
    );
    request.on("error", () => reject(new Error("Origem local indisponivel.")));
  });
}

async function main() {
  if (
    process.platform !== "win32" ||
    !require("node:child_process").execFileSync("C:/Windows/System32/reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid", "/reg:64"], { encoding: "utf8", windowsHide: true }).toLowerCase().includes("307c6e6f-185b-4e19-b354-5cbd5c37adcc") ||
    process.argv.length !== 2
  ) {
    throw new Error("Alvo da ponte diverge da nova VM autorizada.");
  }
  await checkOrigin(38080, "/");
  await checkOrigin(28081, "/api/v1/auth/csrf");
  const running = await startLoopbackBridges(productionMappings);
  const stop = async () => {
    await running.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  for (const bridge of running.bridges) bridge.server.on("error", stop);
  process.stdout.write(
    `${JSON.stringify({ event: "ready", pid: process.pid, mappings: productionMappings })}\n`,
  );
}

module.exports = {
  createLoopbackBridge,
  startLoopbackBridges,
  checkOrigin,
  productionMappings,
  validOriginPath,
  endToEndHeaders,
};
if (require.main === module) {
  main().catch(() => {
    process.stderr.write(
      "Ponte HTTPS nao iniciada: alvo, origem ou porta local indisponivel; conteudo omitido.\n",
    );
    process.exitCode = 1;
  });
}
