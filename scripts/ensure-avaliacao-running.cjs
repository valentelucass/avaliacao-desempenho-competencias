"use strict";
const fs = require("node:fs");
const path = require("node:path").win32;
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const repo =
  "C:\\Users\\suporte\\Documents\\projetos\\avaliacao-desempenho-competencias";
const artifacts =
  "C:\\CloudflareMigracao\\preparado-WIN-00NEDIJ1R5P\\artifacts\\avaliacao";
const expected = [
  {
    name: "avaliacao-api-28081",
    cwd: repo + "\\backend",
    exe: "C:\\Users\\suporte\\AppData\\Local\\Programs\\Eclipse Adoptium\\jdk-21\\bin\\java.exe",
    args: [
      "-jar",
      artifacts + "\\backend\\avaliacao-desempenho-api-0.0.1-SNAPSHOT.jar",
      "--spring.config.additional-location=file:C:\\ProgramData\\Rodogarcia\\AvaliacaoDesempenho\\production\\avaliacao-prod.properties",
      "--server.address=127.0.0.1",
      "--server.port=28081",
    ],
  },
  {
    name: "avaliacao-front-38080",
    cwd: repo + "\\frontend",
    exe: "C:\\Program Files\\nodejs\\node.exe",
    args: [
      repo + "\\frontend\\node_modules\\vite\\bin\\vite.js",
      "preview",
      "--outDir",
      artifacts + "\\frontend-dist",
      "--host",
      "127.0.0.1",
      "--port",
      "38080",
      "--strictPort",
    ],
  },
];
const production =
  "C:\\ProgramData\\Rodogarcia\\AvaliacaoDesempenho\\production";
const releaseRoot = path.join(repo, "backend", "target", "releases");
const savedProcesses = "C:\\Users\\suporte\\.pm2\\dump.pm2";

function verifyInstalledJar(jar, releaseId) {
  const receipt = releaseId
    ? path.join(production, "release-hashes", releaseId + ".sha256")
    : path.join(production, "sql-recovery", "dependencies.json");
  if (
    fs.realpathSync.native(jar) !== jar ||
    fs.realpathSync.native(receipt) !== receipt
  ) {
    throw Error("RELEASE_PATH_CHANGED");
  }
  const record = fs.readFileSync(receipt, "utf8");
  const approved = releaseId
    ? record.trim()
    : JSON.parse(record).files.find((item) => path.normalize(item.path) === jar)
        ?.sha256;
  const actual = createHash("sha256")
    .update(fs.readFileSync(jar))
    .digest("hex");
  if (actual !== approved) throw Error("RELEASE_HASH_CHANGED");
}

function installedDefinitions(saved, verifyJar = verifyInstalledJar) {
  const entries = expected.map(({ name }) => {
    const matching = saved.filter((entry) => entry.name === name);
    if (matching.length !== 1) throw Error("SAVED_APPLICATION_NOT_REGISTERED");
    return matching[0];
  });
  const jar = entries[0].args?.[1];
  let definitions = expected;
  let releaseId;
  if (jar !== expected[0].args[1]) {
    if (typeof jar !== "string") throw Error("INVALID_RELEASE_PATH");
    releaseId = path.basename(path.dirname(jar));
    const file = path.basename(jar);
    if (
      !/^[a-f0-9]{32}$/.test(releaseId) ||
      !/^avaliacao-desempenho-api-[0-9][0-9A-Za-z.-]*\.jar$/.test(file) ||
      jar !== path.join(releaseRoot, releaseId, file)
    )
      throw Error("INVALID_RELEASE_PATH");
    definitions = [
      {
        ...expected[0],
        args: [
          "-jar",
          jar,
          "--spring.config.additional-location=optional:file:" +
            path.join(production, "avaliacao-prod.properties"),
          "--server.address=127.0.0.1",
          "--server.port=28081",
        ],
      },
      {
        ...expected[1],
        args: [
          expected[1].args[0],
          "preview",
          "--host",
          "127.0.0.1",
          "--port",
          "38080",
          "--strictPort",
        ],
      },
    ];
  }
  entries.forEach((entry, index) =>
    assertDefinition(entry, definitions[index]),
  );
  verifyJar(jar, releaseId);
  return definitions;
}

function assertDefinition(env, spec) {
  if (
    env.pm_exec_path !== spec.exe ||
    env.pm_cwd !== spec.cwd ||
    env.exec_interpreter !== "none" ||
    !isDeepStrictEqual(env.args, spec.args)
  ) {
    throw Error("APPLICATION_DEFINITION_CHANGED");
  }
}

function selectTargets(rows, restartApi, definitions) {
  return definitions.map((e) => {
    const found = rows.filter((r) => r.name === e.name);
    if (found.length !== 1) throw Error("EXPECTED_APPLICATION_NOT_REGISTERED");
    const row = found[0],
      env = row.pm2_env;
    assertDefinition(env, e);
    if (
      !["online", "stopped", "errored", "waiting restart"].includes(env.status)
    )
      throw Error("APPLICATION_TRANSITION_IN_PROGRESS");
    // A scheduled PM2 retry picks up the new TLS configuration on its own.
    const restart =
      ["stopped", "errored"].includes(env.status) ||
      (env.status === "online" && restartApi && e.name === expected[0].name);
    return { id: env.pm_id, name: e.name, pid: row.pid, restart };
  });
}
module.exports = { selectTargets, installedDefinitions, expected };
if (require.main === module) {
  const apply = process.argv.includes("--apply"),
    restartApi = process.argv.includes("--restart-api");
  if (
    process.argv.slice(2).some((a) => !["--apply", "--restart-api"].includes(a))
  ) {
    console.log('{"status":"INVALID_ARGUMENTS"}');
    process.exit(1);
  }
  const pm2 = "C:\\Users\\suporte\\AppData\\Roaming\\npm\\node_modules\\pm2";
  const socket = require(pm2 + "\\modules\\pm2-axon").socket("req");
  const client = new (require(pm2 + "\\modules\\pm2-axon-rpc").Client)(socket);
  let transport,
    finished = false;
  const timer = setTimeout(() => finish(1, { status: "RPC_TIMEOUT" }), 30000);
  function finish(code, result) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try {
      socket.close();
      transport?.destroy();
    } catch {}
    console.log(
      JSON.stringify({ ...result, daemonSpawned: false, saved: false }),
    );
    process.exit(code);
  }
  const call = (method, arg) =>
    new Promise((resolve, reject) =>
      client.call(method, arg, (err, rows) =>
        err ? reject(Error("RPC_METHOD_FAILED")) : resolve(rows),
      ),
    );
  socket.once("error", () => finish(1, { status: "RPC_ACCESS_FAILED" }));
  socket.once("connect", async () => {
    try {
      const definitions = installedDefinitions(
        JSON.parse(fs.readFileSync(savedProcesses, "utf8")),
      );
      const before = await call("getMonitorData", {}),
        targets = selectTargets(before, restartApi, definitions),
        restarted = [];
      if (apply)
        for (const target of targets.filter((t) => t.restart)) {
          await call("restartProcessId", { id: target.id });
          restarted.push(target.name);
        }
      const after = await call("getMonitorData", {});
      const changedOthers = before
        .filter((r) => !expected.some((e) => e.name === r.name))
        .some(
          (r) =>
            !after.some(
              (a) =>
                a.name === r.name &&
                a.pid === r.pid &&
                a.pm2_env.pm_id === r.pm2_env.pm_id,
            ),
        );
      if (changedOthers) throw Error("OTHER_RUNTIME_CHANGED_DURING_CHECK");
      const processes = selectTargets(after, false, definitions).map(
        ({ name, pid }) => ({ name, pid }),
      );
      finish(0, {
        status: apply ? "APPLICATIONS_ENSURED" : "APPLICATIONS_VERIFIED",
        restarted,
        processes,
        otherProcessesPreserved: true,
      });
    } catch (error) {
      finish(1, {
        status: /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "CHECK_FAILED",
      });
    }
  });
  transport = socket.connect("\\\\.\\pipe\\rpc.sock");
}
