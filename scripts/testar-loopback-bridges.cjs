const assert = require("node:assert/strict");
const net = require("node:net");
const http = require("node:http");
const {
  createLoopbackBridge,
  startLoopbackBridges,
  checkOrigin,
  productionMappings,
} = require("./formulario-loopback-bridges.cjs");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
function exchange(port, data, pauseMs = 0) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(3000, () => socket.destroy(new Error("Fixture timeout")));
    socket.on("connect", () => {
      if (pauseMs > 0) {
        socket.pause();
        setTimeout(() => socket.resume(), pauseMs);
      }
      socket.end(data);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function main() {
  let passed = 0;
  assert.deepEqual(productionMappings, [
    { listenPort: 18080, targetPort: 38080 },
    { listenPort: 18081, targetPort: 28081 },
  ]);
  passed++;
  const seen = [];
  const response = Buffer.from(
    "HTTP/1.1 200 OK\r\nSet-Cookie: fixture=value; HttpOnly; Secure; SameSite=Strict\r\nContent-Length: 2\r\n\r\nOK",
  );
  const origin = net.createServer({ allowHalfOpen: true }, (socket) => {
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      seen.push(Buffer.concat(chunks));
      socket.end(response);
    });
  });
  const targetPort = await listen(origin);
  const bridge = createLoopbackBridge({ listenPort: 0, targetPort });
  try {
    const address = await bridge.listen();
    assert.equal(address.address, "127.0.0.1");
    passed++;
    const request = Buffer.from(
      "GET /api/v1/auth/csrf HTTP/1.1\r\nHost: api-formulario.rodogarcia.com.br\r\nX-Forwarded-Proto: https\r\nCookie: fixture=value\r\n\r\n",
    );
    assert.deepEqual(await exchange(address.port, request), response);
    assert.deepEqual(seen[0], request);
    passed++;
    const large = Buffer.alloc(1024 * 1024, 0x61);
    assert.deepEqual(await exchange(address.port, large), response);
    assert.deepEqual(seen[1], large);
    passed++;
    await bridge.close();
    await assert.rejects(exchange(address.port, request));
    passed++;
  } finally {
    await bridge.close();
    await close(origin);
  }

  const largeResponse = Buffer.alloc(2 * 1024 * 1024, 0x62);
  const largeOrigin = net.createServer({ allowHalfOpen: true }, (socket) => {
    socket.on("data", () => {});
    socket.on("end", () => socket.end(largeResponse));
  });
  const largeTarget = await listen(largeOrigin);
  const largeBridge = createLoopbackBridge({
    listenPort: 0,
    targetPort: largeTarget,
  });
  try {
    const largeAddress = await largeBridge.listen();
    assert.deepEqual(
      await exchange(largeAddress.port, Buffer.from("FIXTURE"), 150),
      largeResponse,
    );
    passed++;
  } finally {
    await largeBridge.close();
    await close(largeOrigin);
  }

  const occupied = net.createServer();
  const occupiedPort = await listen(occupied);
  const reservation = net.createServer();
  const firstPort = await listen(reservation);
  await close(reservation);
  try {
    await assert.rejects(
      startLoopbackBridges([
        { listenPort: firstPort, targetPort: occupiedPort },
        { listenPort: occupiedPort, targetPort: firstPort },
      ]),
    );
    const proofReleased = net.createServer();
    await new Promise((resolve, reject) => {
      proofReleased.once("error", reject);
      proofReleased.listen(firstPort, "127.0.0.1", resolve);
    });
    await close(proofReleased);
    assert.equal(occupied.listening, true);
    passed++;
  } finally {
    await close(occupied);
  }

  assert.throws(() => createLoopbackBridge({ listenPort: -1, targetPort: 80 }));
  assert.throws(() => createLoopbackBridge({ listenPort: 0, targetPort: 0 }));
  passed++;
  const healthy = http.createServer((_request, response) => {
    response.writeHead(200);
    response.end("FIXTURE");
  });
  const unhealthy = http.createServer((_request, response) => {
    response.writeHead(503);
    response.end("FIXTURE");
  });
  try {
    const goodPort = await listen(healthy);
    const badPort = await listen(unhealthy);
    await checkOrigin(goodPort, "/");
    await assert.rejects(checkOrigin(badPort, "/"));
    passed++;
  } finally {
    await close(healthy);
    await close(unhealthy);
  }
  console.log(
    `Pontes loopback: ${passed} cenarios ficticios aprovados; portas produtivas/processos externos nao alterados.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
