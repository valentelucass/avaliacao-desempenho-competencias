const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "adc-browser-paths-"));
const frontend = path.join(fixture, "frontend");
const served = path.join(frontend, "dist");
const source = fs.readFileSync(
  path.join(__dirname, "../frontend/scripts/browser-artifacts.cjs"),
  "utf8",
);
let cases = 0;
function load(environment, temporaryDirectory) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    require: (name) =>
      name === "node:os" && temporaryDirectory
        ? { tmpdir: () => temporaryDirectory }
        : require(name),
    process: { env: environment },
    __dirname: path.join(frontend, "scripts"),
  });
  return module.exports;
}
try {
  fs.mkdirSync(path.join(served, "assets"), { recursive: true });
  fs.writeFileSync(path.join(served, "index.html"), "approved-index-sentinel");
  fs.writeFileSync(
    path.join(served, "assets/approved.js"),
    "approved-asset-sentinel",
  );
  const before = fs.readFileSync(path.join(served, "index.html"));
  for (const directory of [served, path.join(served, "captures"), frontend]) {
    const api = load({ ADC_BROWSER_ARTIFACT_DIRECTORY: directory });
    assert.throws(() => api.browserArtifactPath("capture.png"));
    cases++;
  }
  const alias = path.join(fixture, "link-to-served");
  fs.symlinkSync(served, alias, "junction");
  assert.throws(() =>
    load({ ADC_BROWSER_ARTIFACT_DIRECTORY: alias }).browserArtifactPath(
      "capture.png",
    ),
  );
  assert.throws(() => load({}).safeBrowserArtifactDirectory(alias));
  assert.throws(() => load({}, served).browserArtifactPath("capture.png"));
  assert.throws(() =>
    load({
      ADC_FRONTEND_BUILD_DIRECTORY: served,
    }).frontendBuildAssetsDirectory(),
  );
  cases += 4;
  const output = path.join(fixture, "evidence with spaces");
  const api = load({ ADC_BROWSER_ARTIFACT_DIRECTORY: output });
  const filename = api.browserArtifactPath("capture.png");
  fs.writeFileSync(filename, "synthetic-capture");
  assert.equal(filename, path.join(output, "capture.png"));
  assert.throws(() => api.browserArtifactPath("../index.html"));
  assert.throws(() => api.browserArtifactPath("."));
  cases += 3;
  const linkedCapture = path.join(output, "linked.png");
  fs.symlinkSync(served, linkedCapture, "junction");
  assert.throws(() => api.browserArtifactPath("linked.png"));
  assert.equal(fs.existsSync(path.join(served, "linked.png")), false);
  fs.rmdirSync(linkedCapture);
  const hardlinkedCapture = path.join(output, "hardlinked.png");
  fs.linkSync(path.join(served, "index.html"), hardlinkedCapture);
  assert.throws(() => api.browserArtifactPath("hardlinked.png"));
  fs.unlinkSync(hardlinkedCapture);
  const movedOutput = path.join(fixture, "original-evidence");
  const escapedOutput = path.join(fixture, "escaped-evidence");
  fs.mkdirSync(escapedOutput);
  fs.writeFileSync(path.join(escapedOutput, "capture.png"), "outside-sentinel");
  fs.renameSync(output, movedOutput);
  fs.symlinkSync(escapedOutput, output, "junction");
  assert.throws(() => api.browserArtifactPath("capture.png"));
  assert.equal(
    fs.readFileSync(path.join(escapedOutput, "capture.png"), "utf8"),
    "outside-sentinel",
  );
  fs.rmdirSync(output);
  fs.renameSync(movedOutput, output);
  cases += 5;
  const candidate = path.join(fixture, "candidate with spaces");
  assert.equal(
    load({
      ADC_FRONTEND_BUILD_DIRECTORY: candidate,
    }).frontendBuildAssetsDirectory(),
    path.join(candidate, "assets"),
  );
  assert.equal(
    load({}).frontendBuildAssetsDirectory(),
    path.join(served, "assets"),
  );
  assert.deepEqual(fs.readFileSync(path.join(served, "index.html")), before);
  assert.deepEqual(fs.readdirSync(served).sort(), ["assets", "index.html"]);
  cases += 4;
  const temporary = path.dirname(
    load({}).browserArtifactPath("standalone.png"),
  );
  assert.ok(temporary.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
  assert.ok(path.basename(temporary).startsWith("adc-browser-artifacts-"));
  fs.rmdirSync(temporary);
  cases++;
  console.log(
    `Browser artifacts: ${cases} verificações fictícias aprovadas; dist servido preservado.`,
  );
} finally {
  const resolved = fs.realpathSync(fixture);
  assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
  assert.ok(path.basename(resolved).startsWith("adc-browser-paths-"));
  fs.rmSync(resolved, { recursive: true });
}
