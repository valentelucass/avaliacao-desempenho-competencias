const net = require("node:net");
const http = require("node:http");
const os = require("node:os");

const productionMappings = Object.freeze([
  Object.freeze({ listenPort: 18080, targetPort: 38080 }),
  Object.freeze({ listenPort: 18081, targetPort: 28081 }),
]);

function createLoopbackBridge({ listenPort, targetPort }) {
  if (
    !Number.isInteger(listenPort) ||
    listenPort < 0 ||
    listenPort > 65535 ||
    !Number.isInteger(targetPort) ||
    targetPort < 1 ||
    targetPort > 65535
  ) {
    throw new Error("Porta de ponte invalida.");
  }
  const sockets = new Set();
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    const upstream = net.createConnection({
      host: "127.0.0.1",
      port: targetPort,
      allowHalfOpen: true,
    });
    sockets.add(client);
    sockets.add(upstream);
    const abort = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", abort);
    upstream.on("error", abort);
    client.on("close", (hadError) => {
      sockets.delete(client);
      if (hadError) upstream.destroy();
      else upstream.end();
    });
    upstream.on("close", (hadError) => {
      sockets.delete(upstream);
      if (hadError) client.destroy();
      else client.end();
    });
    client.setTimeout(120000, abort);
    upstream.setTimeout(120000, abort);
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    // pipe preserva os bytes e aplica backpressure; nao interpreta HTTP/headers.
    client.pipe(upstream);
    upstream.pipe(client);
  });
  server.maxConnections = 200;
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
    os.hostname() !== "WIN-00NEDIJ1R5P" ||
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
};
if (require.main === module) {
  main().catch(() => {
    process.stderr.write(
      "Ponte nao iniciada: alvo, origem ou porta local indisponivel; conteudo omitido.\n",
    );
    process.exitCode = 1;
  });
}
