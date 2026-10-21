const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const publicApi = "https://api-formulario.rodogarcia.com.br/api/v1";
let cases = 0;

function write(root, relative, contents) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function inventory(directory) {
  const result = {};
  function visit(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, item.name);
      assert.equal(item.isSymbolicLink(), false);
      if (item.isDirectory()) visit(file);
      else {
        result[path.relative(directory, file).replaceAll("\\", "/")] = crypto
          .createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
      }
    }
  }
  visit(directory);
  return Object.fromEntries(
    Object.entries(result).sort(([first], [second]) =>
      first.localeCompare(second),
    ),
  );
}

if (process.platform === "win32") {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "adc-launcher-staging-"),
  );
  try {
    const scenarios = [
      { name: "late-audit-failure", gateExit: 23, approve: false },
      { name: "promotion-without-approval", gateExit: 0, approve: false },
      { name: "promotion-before-mocked-pm2", gateExit: 0, approve: true },
    ];
    for (const scenario of scenarios) {
      const fixture = path.join(fixtureRoot, scenario.name);
      fs.mkdirSync(path.join(fixture, "scripts"), { recursive: true });
      for (const file of ["iniciar-prod.bat", "scripts/frontend-staging.ps1"]) {
        fs.copyFileSync(
          path.join(repositoryRoot, file),
          path.join(fixture, file),
        );
      }
      const oldIndex =
        '<!doctype html><script src="/assets/installed.js"></script>';
      const fixtureHelper = path.join(fixture, "scripts/frontend-staging.ps1");
      assert.ok(
        fs
          .readFileSync(fixtureHelper, "utf8")
          .includes("Global\\Rodogarcia-Avaliacao-Frontend-Promotion-v1"),
        "Review fixture mutex isolation after helper contract changes",
      );
      fs.writeFileSync(
        fixtureHelper,
        fs
          .readFileSync(fixtureHelper, "utf8")
          .replaceAll(
            "Global\\Rodogarcia-Avaliacao-Frontend-Promotion-v1",
            "Local\\Rodogarcia-Avaliacao-Frontend-Promotion-fixture-" +
              path.basename(fixtureRoot),
          ),
      );
      write(fixture, "frontend/dist/index.html", oldIndex);
      write(fixture, "frontend/dist/assets/installed.js", "installed-only");
      write(fixture, "frontend/dist/assets/old-unreferenced.js", "preserve-me");
      write(fixture, "frontend/dist/nested/sentinel.txt", "unchanged-by-gate");
      write(fixture, "frontend/dist/favicon.svg", "installed-icon");
      const servedDist = path.join(fixture, "frontend/dist");
      const before = inventory(servedDist);

      write(fixture, "frontend/package-lock.json", "{}\n");
      write(
        fixture,
        "frontend/node_modules/.adc-package-lock.sha256",
        crypto.createHash("sha256").update("{}\n").digest("hex"),
      );
      for (const relative of [
        ".package-lock.json",
        ".bin/prettier.cmd",
        "prettier/package.json",
        "vite/bin/vite.js",
      ]) {
        write(fixture, "frontend/node_modules/" + relative, "fixture-only");
      }
      write(fixture, "jdk/bin/java.exe", "not-an-executable");
      write(fixture, "ecosystem.config.cjs", "module.exports={apps:[]};");
      write(fixture, "production.properties", "synthetic=true\n");
      write(
        fixture,
        "database/config.production.local.bat",
        '@echo off\r\necho mock-database-config>>"%~dp0..\\calls.log"\r\nexit /b 0\r\n',
      );
      for (const name of [
        "run-backend.ps1",
        "validate-production-runtime.ps1",
        "encerrar-dev-local-antes-producao.ps1",
      ]) {
        write(
          fixture,
          "scripts/" + name,
          "param([switch]$ValidateOnly)\n$ErrorActionPreference='Stop'\n" +
            "Add-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'calls.log') -Value ('mock-helper '+[IO.Path]::GetFileName($PSCommandPath))\nexit 0\n",
        );
      }
      write(
        fixture,
        "scripts/check-pm2-access.cjs",
        "require('node:fs').appendFileSync(require('node:path').join(__dirname,'..','calls.log'),'mock-probe\\n'); process.exit(0);\n",
      );
      write(
        fixture,
        "pm2.cmd",
        [
          "@echo off",
          'echo pm2 %*>>"%~dp0calls.log"',
          'if /i "%~1"=="describe" exit /b 0',
          'if /i "%~1"=="delete" (',
          '  findstr /c:"stage-main.js" "%~dp0frontend\\dist\\index.html" >nul',
          "  if errorlevel 1 exit /b 98",
          '  echo mock-pm2-observed-promoted-index>>"%~dp0calls.log"',
          "  exit /b 47",
          ")",
          'echo unexpected-production-command>>"%~dp0calls.log"',
          "exit /b 99",
          "",
        ].join("\r\n"),
      );
      write(
        fixture,
        "npm.cmd",
        '@echo off\r\necho forbidden-npm>>"%~dp0calls.log"\r\nexit /b 99\r\n',
      );
      write(
        fixture,
        "scripts/verify-production-quality.ps1",
        String.raw`param([Parameter(Mandatory)][string]$BackendBuildDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'frontend-staging.ps1')
$fixture=Split-Path -Parent $PSScriptRoot
$directory=$env:ADC_FRONTEND_BUILD_DIRECTORY
$api=$env:ADC_FRONTEND_API_BASE_URL
if($env:VITE_API_BASE_URL){throw 'PUBLIC_VITE_BASE_LEAKED_INTO_GATE'}
if($env:ADC_BROWSER_ARTIFACT_DIRECTORY -or $env:ADC_CYCLE_SCREENSHOT_DIRECTORY){throw 'INHERITED_ARTIFACT_DIRECTORY_LEAKED_INTO_FIXTURE'}
$stage=Initialize-FrontendStage -Directory $directory
Start-FrontendBuild -Directory $directory -ApiBaseUrl $api
New-Item -ItemType Directory -Path (Join-Path $directory 'assets') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $directory 'index.html'), '<!doctype html><script src="/assets/stage-main.js"></script><link href="/assets/stage-main.css" rel="stylesheet">')
[IO.File]::WriteAllText((Join-Path $directory 'assets/stage-main.js'), 'const API_BASE_URL="'+$api+'";')
[IO.File]::WriteAllText((Join-Path $directory 'assets/stage-main.css'), 'body{color:blue}')
New-Item -ItemType Directory -Path $stage.BrowserArtifactsDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $stage.BrowserArtifactsDirectory 'fixture.png'), 'synthetic-evidence')
Complete-FrontendBuild -Directory $directory -ApiBaseUrl $api
$jarDirectory=Join-Path (Join-Path $fixture 'backend') $BackendBuildDirectory
New-Item -ItemType Directory -Path $jarDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $jarDirectory 'avaliacao-desempenho-api-fixture.jar'), 'not-a-real-jar')
@{buildDirectory=$directory;apiBaseUrl=$api;backendBuildDirectory=$BackendBuildDirectory} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixture 'gate.json') -Encoding UTF8
Add-Content -LiteralPath (Join-Path $fixture 'calls.log') -Value 'mock-build-complete'
if($env:ADC_STAGING_TEST_GATE_EXIT -ne '0'){
    Add-Content -LiteralPath (Join-Path $fixture 'calls.log') -Value 'mock-audit-ENOTFOUND'
    Write-Output 'Simulated npm audit ENOTFOUND after completed isolated build'
    exit ([int]$env:ADC_STAGING_TEST_GATE_EXIT)
}
if($env:ADC_STAGING_TEST_APPROVE -eq '1'){
    Approve-FrontendBuild -Directory $directory
    Add-Content -LiteralPath (Join-Path $fixture 'calls.log') -Value 'mock-quality-passed'
}
exit 0
`,
      );

      const result = spawnSync(
        process.env.ComSpec,
        ["/d", "/c", "iniciar-prod.bat --publicar"],
        {
          cwd: fixture,
          encoding: "utf8",
          windowsHide: true,
          timeout: 60000,
          env: {
            ...process.env,
            PATH:
              fixture +
              ";" +
              path.dirname(process.execPath) +
              ";" +
              process.env.PATH,
            NODE_OPTIONS: "",
            ADC_FRONTEND_BUILD_DIRECTORY: "",
            ADC_FRONTEND_API_BASE_URL: "",
            ADC_BROWSER_ARTIFACT_DIRECTORY: "",
            ADC_CYCLE_SCREENSHOT_DIRECTORY: "",
            VITE_API_BASE_URL: "https://caller.synthetic.invalid/api/v1",
            AVALIACAO_DESEMPENHO_ENV_LOADED: "1",
            AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG: path.join(
              fixture,
              "production.properties",
            ),
            AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL: publicApi,
            AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY: path.join(
              fixture,
              "logs",
            ),
            JAVA_HOME: path.join(fixture, "jdk"),
            ADC_STAGING_TEST_GATE_EXIT: String(scenario.gateExit),
            ADC_STAGING_TEST_APPROVE: scenario.approve ? "1" : "0",
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const calls = fs.readFileSync(path.join(fixture, "calls.log"), "utf8");
      assert.match(calls, /mock-build-complete/);
      assert.doesNotMatch(calls, /forbidden-npm|unexpected-production-command/);
      const gate = JSON.parse(
        fs
          .readFileSync(path.join(fixture, "gate.json"), "utf8")
          .replace(/^\uFEFF/, ""),
      );
      assert.equal(gate.apiBaseUrl, publicApi);
      assert.match(
        path.relative(fixture, gate.buildDirectory).replaceAll("\\", "/"),
        /^backend\/target\/frontend-staging\/[a-f0-9]{32}\/dist$/i,
      );
      assert.notEqual(path.resolve(gate.buildDirectory), servedDist);
      const stageDirectory = path.dirname(gate.buildDirectory);
      assert.ok(
        fs.existsSync(path.join(stageDirectory, "browser-checks/fixture.png")),
      );
      assert.equal(fs.existsSync(path.join(servedDist, "fixture.png")), false);

      if (!scenario.approve) {
        assert.deepEqual(inventory(servedDist), before);
        assert.doesNotMatch(
          calls,
          /pm2 (delete|start|restart|reload|save|kill)/i,
        );
        assert.equal(
          fs.existsSync(path.join(stageDirectory, "previous-dist")),
          false,
        );
        if (scenario.gateExit) {
          assert.match(calls, /mock-audit-ENOTFOUND/);
          assert.match(result.stdout, /Pre-flight falhou/);
        } else {
          assert.match(result.stdout, /Promocao do frontend recusada/);
        }
      } else {
        assert.match(calls, /mock-quality-passed/);
        assert.match(
          calls,
          /mock-pm2-observed-promoted-index/,
          result.stdout + result.stderr,
        );
        assert.doesNotMatch(calls, /pm2 (start|restart|reload|save|kill)/i);
        assert.ok(
          calls.indexOf("mock-quality-passed") < calls.indexOf("pm2 delete"),
        );
        assert.deepEqual(
          inventory(path.join(stageDirectory, "previous-dist")),
          before,
        );
        assert.match(
          fs.readFileSync(path.join(servedDist, "index.html"), "utf8"),
          /stage-main\.js/,
        );
        assert.equal(
          fs.readFileSync(
            path.join(servedDist, "assets/old-unreferenced.js"),
            "utf8",
          ),
          "preserve-me",
        );
      }
      cases++;
    }
  } finally {
    const resolved = fs.realpathSync(fixtureRoot);
    const temporary = fs.realpathSync(os.tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(temporary));
    assert.ok(path.basename(resolved).startsWith("adc-launcher-staging-"));
    fs.rmSync(resolved, { recursive: true });
  }
}
console.log(
  `Launcher staging validado: ${cases} cenarios simulados, sem SQL, rede, UAC ou PM2 real.`,
);
