const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const {
  createLoopbackBridge,
  startLoopbackBridges,
  productionMappings,
  validOriginPath,
  endToEndHeaders,
} = require("./formulario-https-loopback-bridges.cjs");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
function bounded(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Fixture cleanup timeout")),
        3000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
function request(
  port,
  {
    path = "/api/v1/fixture",
    method = "GET",
    headers = {},
    body,
    agent = false,
    slow = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const outbound = http.request(
      { host: "127.0.0.1", port, path, method, headers, agent, timeout: 5000 },
      (response) => {
        const parts = [];
        if (slow) {
          response.pause();
          setTimeout(() => response.resume(), 30);
        }
        response.on("data", (part) => parts.push(part));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(parts),
          }),
        );
        response.on("error", reject);
      },
    );
    outbound.on("error", reject);
    outbound.on("timeout", () =>
      outbound.destroy(new Error("Fixture timeout")),
    );
    if (body) outbound.end(body);
    else outbound.end();
  });
}
function raw(port, text) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const parts = [];
    socket.setTimeout(5000, () => socket.destroy(new Error("Fixture timeout")));
    socket.on("connect", () => socket.write(text));
    socket.on("data", (part) => parts.push(part));
    socket.on("end", () => resolve(Buffer.concat(parts).toString("latin1")));
    socket.on("error", reject);
  });
}

async function main() {
  let passed = 0;
  assert.deepEqual(
    productionMappings.map(({ listenPort, targetPort, hostname, kind }) => [
      listenPort,
      targetPort,
      hostname,
      kind,
    ]),
    [
      [18080, 38080, "formulario.rodogarcia.com.br", "frontend"],
      [18081, 28081, "api-formulario.rodogarcia.com.br", "api"],
    ],
  );
  for (const path of [
    "//outside.invalid/",
    "/api/v1/\\evil",
    "/api/v1/%5cevil",
    "/api/v1/%2e%2e/secret",
    "/api/v1/%0d%0aX:test",
    "http://outside.invalid/",
    "/api/v1/fixture#fragment",
    "/api/v1/%",
    "/not-api",
  ])
    assert.equal(validOriginPath(path, "api"), false);
  assert.equal(validOriginPath("/api/v1/fixture?term=a%20b&n=2", "api"), true);
  assert.equal(
    validOriginPath("/api/v1/fixture?target=https://fixture.invalid/", "api"),
    true,
  );
  assert.throws(() =>
    createLoopbackBridge({
      listenPort: 0,
      targetPort: 1,
      hostname: "outside.invalid",
      kind: "api",
    }),
  );
  assert.throws(() =>
    createLoopbackBridge({
      listenPort: -1,
      targetPort: 1,
      hostname: "api-formulario.rodogarcia.com.br",
      kind: "api",
    }),
  );
  passed += 3;

  const seen = [];
  const bigResponse = Buffer.alloc(2 * 1024 * 1024, 0x62);
  const origin = http.createServer((incoming, outgoing) => {
    const parts = [];
    incoming.on("data", (part) => parts.push(part));
    incoming.on("end", () => {
      const body = Buffer.concat(parts);
      seen.push({
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers,
        body,
      });
      outgoing.setHeader("set-cookie", [
        "fixture-access=one; HttpOnly; Secure; SameSite=Strict; Path=/",
        "fixture-csrf=two; Secure; SameSite=Strict; Path=/",
      ]);
      outgoing.setHeader(
        "access-control-allow-origin",
        "https://formulario.rodogarcia.com.br",
      );
      outgoing.setHeader("access-control-allow-credentials", "true");
      outgoing.setHeader(
        "content-security-policy",
        "default-src 'none'; frame-ancestors 'none'",
      );
      outgoing.setHeader("strict-transport-security", "max-age=31536000");
      outgoing.setHeader("connection", "x-origin-hop, close");
      outgoing.setHeader("x-origin-hop", "remove-fixture");
      if (incoming.method === "OPTIONS") {
        outgoing.writeHead(204);
        outgoing.end();
      } else if (incoming.url === "/api/v1/large") {
        outgoing.writeHead(200, { "content-length": bigResponse.length });
        outgoing.end(bigResponse);
      } else {
        outgoing.writeHead(200);
        outgoing.end(body.length ? body : Buffer.from("fixture-ok"));
      }
    });
  });
  const originPort = await listen(origin);
  const bridge = createLoopbackBridge({
    listenPort: 0,
    targetPort: originPort,
    hostname: "api-formulario.rodogarcia.com.br",
    kind: "api",
  });
  const address = await bridge.listen();
  const good = {
    host: "api-formulario.rodogarcia.com.br",
    "x-forwarded-proto": "https",
  };
  try {
    assert.equal(address.address, "127.0.0.1");
    const baseline = seen.length;
    const path = "/api/v1/fixture?term=a%20b&n=2";
    const redirect = await request(address.port, {
      path,
      method: "POST",
      headers: { ...good, "x-forwarded-proto": "http" },
      body: "fictional-only",
    });
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.headers.location,
      `https://api-formulario.rodogarcia.com.br${path}`,
    );
    assert.equal(redirect.body.length, 0);
    assert.equal(seen.length, baseline);
    const queryPath = "/api/v1/fixture?target=https://fixture.invalid/&a=1";
    assert.equal(
      (
        await request(address.port, {
          path: queryPath,
          headers: { ...good, "x-forwarded-proto": "http" },
        })
      ).headers.location,
      `https://api-formulario.rodogarcia.com.br${queryPath}`,
    );
    passed += 2;

    const synthetic = Buffer.from('{"only":"fictional request"}');
    const success = await request(address.port, {
      method: "POST",
      path,
      body: synthetic,
      headers: {
        ...good,
        "content-type": "application/json",
        "content-length": synthetic.length,
        cookie: "fixture-a=one; fixture-b=two",
        authorization: "Fixture synthetic",
        "x-csrf-token": "fixture-csrf-value",
        origin: "https://formulario.rodogarcia.com.br",
        connection: "x-request-hop, close",
        "x-request-hop": "drop-fixture",
        forwarded: "proto=http;host=outside.invalid",
        "x-forwarded-host": "outside.invalid",
      },
    });
    assert.equal(success.status, 200);
    assert.deepEqual(success.body, synthetic);
    const received = seen.at(-1);
    assert.equal(received.path, path);
    assert.equal(received.headers.cookie, "fixture-a=one; fixture-b=two");
    assert.equal(received.headers.authorization, "Fixture synthetic");
    assert.equal(received.headers["x-csrf-token"], "fixture-csrf-value");
    assert.equal(
      received.headers.origin,
      "https://formulario.rodogarcia.com.br",
    );
    assert.equal(received.headers["x-forwarded-proto"], "https");
    assert.equal(
      received.headers["x-forwarded-host"],
      "api-formulario.rodogarcia.com.br",
    );
    assert.equal(received.headers.forwarded, undefined);
    assert.equal(received.headers["x-request-hop"], undefined);
    assert.equal(success.headers["x-origin-hop"], undefined);
    assert.equal(success.headers["set-cookie"].length, 2);
    assert.equal(
      success.headers["set-cookie"][0],
      "fixture-access=one; HttpOnly; Secure; SameSite=Strict; Path=/",
    );
    assert.equal(
      success.headers["access-control-allow-origin"],
      "https://formulario.rodogarcia.com.br",
    );
    assert.equal(success.headers["access-control-allow-credentials"], "true");
    assert.equal(
      success.headers["strict-transport-security"],
      "max-age=31536000",
    );
    assert.equal(
      success.headers["content-security-policy"],
      "default-src 'none'; frame-ancestors 'none'",
    );
    passed += 3;

    assert.equal(
      (
        await request(address.port, {
          headers: { ...good, connection: "x-forwarded-proto, close" },
        })
      ).status,
      200,
    );
    assert.equal(seen.at(-1).headers["x-forwarded-proto"], "https");
    passed++;

    const streamed = Buffer.alloc(1024 * 1024, 0x61);
    assert.deepEqual(
      (
        await request(address.port, {
          method: "POST",
          headers: { ...good, "transfer-encoding": "chunked" },
          body: streamed,
        })
      ).body,
      streamed,
    );
    assert.deepEqual(
      (
        await request(address.port, {
          path: "/api/v1/large",
          headers: good,
          slow: true,
        })
      ).body,
      bigResponse,
    );
    assert.equal(
      (await request(address.port, { method: "OPTIONS", headers: good }))
        .status,
      204,
    );
    assert.equal(
      (await request(address.port, { method: "HEAD", headers: good })).body
        .length,
      0,
    );
    passed += 4;

    const probe = await request(address.port, { path: "/api/v1/auth/csrf" });
    assert.equal(probe.status, 200);
    assert.equal(seen.at(-1).headers.host, `127.0.0.1:${originPort}`);
    assert.equal((await request(address.port)).status, 400);
    assert.equal(
      (
        await request(address.port, {
          method: "POST",
          path: "/api/v1/auth/csrf",
        })
      ).status,
      400,
    );
    passed += 2;

    const beforeBad = seen.length;
    for (const bad of [
      { host: "outside.invalid", "x-forwarded-proto": "https" },
      { host: "api-formulario.rodogarcia.com.br" },
      { ...good, "x-forwarded-proto": "https,http" },
      { ...good, "x-forwarded-proto": "HTTPS" },
    ])
      assert.equal((await request(address.port, { headers: bad })).status, 400);
    for (const extra of [
      "Host: outside.invalid\r\n",
      "X-Forwarded-Proto: http\r\n",
    ]) {
      assert.match(
        await raw(
          address.port,
          `GET /api/v1/fixture HTTP/1.1\r\nHost: api-formulario.rodogarcia.com.br\r\nX-Forwarded-Proto: https\r\n${extra}Connection: close\r\n\r\n`,
        ),
        /^HTTP\/1\.1 400 /,
      );
    }
    for (const badPath of [
      "//outside.invalid/",
      "/api/v1/\\evil",
      "/api/v1/%2f%2foutside.invalid",
      "http://outside.invalid/",
    ]) {
      assert.match(
        await raw(
          address.port,
          `GET ${badPath} HTTP/1.1\r\nHost: api-formulario.rodogarcia.com.br\r\nX-Forwarded-Proto: http\r\nConnection: close\r\n\r\n`,
        ),
        /^HTTP\/1\.1 400 /,
      );
    }
    assert.match(
      await raw(
        address.port,
        "CONNECT outside.invalid:443 HTTP/1.1\r\nHost: outside.invalid\r\n\r\n",
      ),
      /^HTTP\/1\.1 405 /,
    );
    assert.match(
      await raw(
        address.port,
        "GET /api/v1/fixture HTTP/1.1\r\nHost: api-formulario.rodogarcia.com.br\r\nX-Forwarded-Proto: https\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      ),
      /^HTTP\/1\.1 426 /,
    );
    assert.match(
      await raw(
        address.port,
        "POST /api/v1/fixture HTTP/1.1\r\nHost: api-formulario.rodogarcia.com.br\r\nX-Forwarded-Proto: https\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n",
      ),
      /^HTTP\/1\.1 400 /,
    );
    assert.equal(seen.length, beforeBad);
    passed += 6;

    const keepAlive = new http.Agent({ keepAlive: true });
    try {
      assert.equal(
        (await request(address.port, { headers: good, agent: keepAlive }))
          .status,
        200,
      );
      assert.equal(
        (
          await request(address.port, {
            headers: { ...good, "x-forwarded-proto": "http" },
            agent: keepAlive,
          })
        ).status,
        308,
      );
    } finally {
      keepAlive.destroy();
    }
    passed++;
  } finally {
    await bridge.close();
    await close(origin);
  }

  const frontOrigin = http.createServer((_incoming, outgoing) =>
    outgoing.end("fixture-front"),
  );
  const frontTarget = await listen(frontOrigin);
  const front = createLoopbackBridge({
    listenPort: 0,
    targetPort: frontTarget,
    hostname: "formulario.rodogarcia.com.br",
    kind: "frontend",
  });
  try {
    const address = await front.listen();
    assert.equal((await request(address.port, { path: "/" })).status, 200);
    const result = await request(address.port, {
      path: "/assets/fixture.js?a=1",
      headers: {
        host: "formulario.rodogarcia.com.br",
        "x-forwarded-proto": "http",
      },
    });
    assert.equal(result.status, 308);
    assert.equal(
      result.headers.location,
      "https://formulario.rodogarcia.com.br/assets/fixture.js?a=1",
    );
    assert.equal(
      (
        await request(address.port, {
          path: "/",
          method: "POST",
          headers: {
            host: "formulario.rodogarcia.com.br",
            "x-forwarded-proto": "https",
          },
        })
      ).status,
      405,
    );
    passed += 2;
  } finally {
    await front.close();
    await close(frontOrigin);
  }

  const reservation = net.createServer();
  const missingPort = await listen(reservation);
  await close(reservation);
  const missing = createLoopbackBridge({
    listenPort: 0,
    targetPort: missingPort,
    hostname: "api-formulario.rodogarcia.com.br",
    kind: "api",
  });
  try {
    const address = await missing.listen();
    assert.equal((await request(address.port, { headers: good })).status, 502);
    passed++;
  } finally {
    await missing.close();
  }

  let downstreamClosed;
  const closedPromise = new Promise((resolve) => {
    downstreamClosed = resolve;
  });
  const breakingOrigin = http.createServer((incoming, outgoing) => {
    incoming.resume();
    outgoing.writeHead(200, { "content-length": "100" });
    outgoing.write("fixture-partial");
    if (incoming.url === "/api/v1/abort-upstream")
      setImmediate(() => outgoing.destroy());
    else incoming.socket.once("close", downstreamClosed);
  });
  const breakingPort = await listen(breakingOrigin);
  const breakingBridge = createLoopbackBridge({
    listenPort: 0,
    targetPort: breakingPort,
    hostname: "api-formulario.rodogarcia.com.br",
    kind: "api",
  });
  try {
    const address = await breakingBridge.listen();
    await assert.rejects(
      request(address.port, { path: "/api/v1/abort-upstream", headers: good }),
    );
    const client = http.get(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/api/v1/abort-client",
        headers: good,
        agent: false,
      },
      (incoming) => {
        incoming.once("data", () => incoming.destroy());
        incoming.on("error", () => {});
      },
    );
    client.on("error", () => {});
    try {
      await bounded(closedPromise);
    } finally {
      client.destroy();
    }
    passed += 2;
  } finally {
    await breakingBridge.close();
    await close(breakingOrigin);
  }

  const occupied = net.createServer();
  const occupiedPort = await listen(occupied);
  const available = net.createServer();
  const availablePort = await listen(available);
  await close(available);
  try {
    await assert.rejects(
      startLoopbackBridges([
        {
          listenPort: availablePort,
          targetPort: occupiedPort,
          hostname: "formulario.rodogarcia.com.br",
          kind: "frontend",
        },
        {
          listenPort: occupiedPort,
          targetPort: availablePort,
          hostname: "api-formulario.rodogarcia.com.br",
          kind: "api",
        },
      ]),
    );
    const reused = net.createServer();
    await new Promise((resolve, reject) => {
      reused.once("error", reject);
      reused.listen(availablePort, "127.0.0.1", resolve);
    });
    await close(reused);
    assert.equal(occupied.listening, true);
    passed++;
  } finally {
    await close(occupied);
  }
  assert.equal(
    endToEndHeaders({
      connection: "x-extra",
      "x-extra": "fixture",
      cookie: "fixture=one",
    }).cookie,
    "fixture=one",
  );
  passed++;
  console.log(
    `Pontes HTTPS loopback: ${passed} cenarios ficticios aprovados; nenhuma porta produtiva, SQL ou servico externo alterado.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
