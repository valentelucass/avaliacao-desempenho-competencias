"use strict";
const assert = require("node:assert/strict");
const {
  selectTargets: select,
  installedDefinitions,
  expected,
} = require("./ensure-avaliacao-running.cjs");
const rows = (definitions = expected) =>
  definitions.map((e, i) => ({
    name: e.name,
    pid: 100 + i,
    pm2_env: {
      pm_id: i,
      pm_exec_path: e.exe,
      pm_cwd: e.cwd,
      exec_interpreter: "none",
      args: [...e.args],
      status: "online",
    },
  }));
const saved = (live) => live.map((row) => ({ name: row.name, ...row.pm2_env }));
const selectTargets = (live, restart) =>
  select(
    live,
    restart,
    installedDefinitions(saved(rows()), (jar, releaseId) => {
      assert.equal(jar, expected[0].args[1]);
      assert.equal(releaseId, undefined);
    }),
  );
assert.deepEqual(
  selectTargets(rows(), false).map((r) => r.restart),
  [false, false],
);
assert.deepEqual(
  selectTargets(rows(), true).map((r) => r.restart),
  [true, false],
);
const stopped = rows();
stopped[0].pm2_env.status = "stopped";
stopped[1].pm2_env.status = "errored";
assert.deepEqual(
  selectTargets(stopped, false).map((r) => r.restart),
  [true, true],
);
assert.throws(() => selectTargets([], false), /NOT_REGISTERED/);
const duplicate = rows();
duplicate.push(duplicate[0]);
assert.throws(() => selectTargets(duplicate, false), /NOT_REGISTERED/);
for (const key of ["pm_exec_path", "pm_cwd", "exec_interpreter"]) {
  const changed = rows();
  changed[0].pm2_env[key] = "unexpected";
  assert.throws(() => selectTargets(changed, true), /DEFINITION_CHANGED/);
}
const args = rows();
args[0].pm2_env.args.push("--unexpected");
assert.throws(() => selectTargets(args, false), /DEFINITION_CHANGED/);
const transition = rows();
transition[0].pm2_env.status = "launching";
assert.throws(() => selectTargets(transition, true), /TRANSITION/);
const unrelated = rows();
unrelated.push({
  name: "other-project",
  pid: 999,
  pm2_env: { pm_id: 99, status: "errored" },
});
assert.deepEqual(
  selectTargets(unrelated, true).map((r) => r.name),
  expected.map((e) => e.name),
);
const releaseId = "1234567890abcdef1234567890abcdef";
const published = rows();
const jar =
  expected[0].cwd +
  "\\target\\releases\\" +
  releaseId +
  "\\avaliacao-desempenho-api-1.0.jar";
published[0].pm2_env.args[1] = jar;
published[0].pm2_env.args[2] = published[0].pm2_env.args[2].replace(
  "=file:",
  "=optional:file:",
);
published[1].pm2_env.args.splice(2, 2);
const verify = (actualJar, id) => {
  assert.equal(actualJar, jar);
  assert.equal(id, releaseId);
};
const definitions = installedDefinitions(saved(published), verify);
assert.deepEqual(
  select(published, false, definitions).map((row) => row.restart),
  [false, false],
);
assert.deepEqual(
  select(published, true, definitions).map((row) => row.restart),
  [true, false],
);
published[0].pm2_env.status = "waiting restart";
assert.deepEqual(
  select(published, true, definitions).map((row) => row.restart),
  [false, false],
);
const mismatch = structuredClone(published);
mismatch[0].pm2_env.args[1] = jar.replace(releaseId, "a".repeat(32));
assert.throws(() => select(mismatch, true, definitions), /DEFINITION_CHANGED/);
for (const wrong of [
  jar.replace(releaseId, ".."),
  jar.replace("releases", "unpublished"),
  jar + ".original",
]) {
  const changed = saved(structuredClone(published));
  changed[0].args[1] = wrong;
  assert.throws(
    () => installedDefinitions(changed, verify),
    /INVALID_RELEASE_PATH/,
  );
}
const wrongFrontend = saved(structuredClone(published));
wrongFrontend[1].args.push("--outDir", "C:\\other");
assert.throws(
  () => installedDefinitions(wrongFrontend, verify),
  /DEFINITION_CHANGED/,
);
assert.throws(
  () =>
    installedDefinitions(saved(published), () => {
      throw Error("RELEASE_HASH_CHANGED");
    }),
  /HASH_CHANGED/,
);
assert.throws(
  () => installedDefinitions(saved(published).slice(1), verify),
  /NOT_REGISTERED/,
);
console.log(
  "Runtime selection checks passed for published and prepared installations.",
);
