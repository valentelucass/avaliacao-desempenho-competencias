const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const probeSource = fs.readFileSync(
  path.join(__dirname, "check-pm2-access.cjs"),
  "utf8",
);
let cases = 0;

function simulateProbe(event, code, requireExistingDaemon) {
  const handlers = {};
  const messages = [];
  let destroyed = false;
  const fakeProcess = {
    platform: "win32",
    argv: [
      "node",
      "probe",
      ...(requireExistingDaemon ? ["--require-existing"] : []),
    ],
    exitCode: 0,
  };
  const fakeSocket = {
    on(name, callback) {
      handlers[name] = callback;
      return this;
    },
    destroy() {
      destroyed = true;
    },
    setTimeout(milliseconds, callback) {
      assert.equal(milliseconds, 3000);
      handlers.timeout = callback;
    },
  };
  vm.runInNewContext(probeSource, {
    process: fakeProcess,
    console: {
      error(message) {
        messages.push(message);
      },
    },
    require(name) {
      assert.equal(name, "node:net");
      return {
        connect(address) {
          assert.equal(address, "\\\\.\\pipe\\rpc.sock");
          return fakeSocket;
        },
      };
    },
  });
  handlers[event]({ code });
  return { exitCode: fakeProcess.exitCode, messages, destroyed };
}

for (const requireExistingDaemon of [false, true]) {
  const connected = simulateProbe("connect", undefined, requireExistingDaemon);
  assert.equal(connected.exitCode, 0);
  assert.equal(connected.destroyed, true);
  cases++;
  for (const code of ["ENOENT", "ECONNREFUSED"]) {
    const absent = simulateProbe("error", code, requireExistingDaemon);
    assert.equal(absent.exitCode, requireExistingDaemon ? 1 : 0);
    assert.equal(absent.messages.length, requireExistingDaemon ? 1 : 0);
    cases++;
  }
}
for (const code of ["EPERM", "EACCES"]) {
  const denied = simulateProbe("error", code, true);
  assert.equal(denied.exitCode, 1);
  assert.match(denied.messages[0], new RegExp(code));
  cases++;
}
const timedOut = simulateProbe("timeout", undefined, true);
assert.equal(timedOut.exitCode, 1);
assert.equal(timedOut.destroyed, true);
cases++;
const unsupportedProcess = {
  platform: "linux",
  argv: ["node", "probe", "--require-existing"],
  exitCode: 0,
};
vm.runInNewContext(probeSource, {
  process: unsupportedProcess,
  console: { error() {} },
  require(name) {
    assert.equal(name, "node:net");
    return {};
  },
});
assert.equal(unsupportedProcess.exitCode, 1);
cases++;

if (process.platform === "win32") {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "adc-launcher-check-"),
  );
  try {
    const configurationFixture = path.join(
      fixtureRoot,
      "production.properties",
    );
    const logFixture = path.join(fixtureRoot, "logs");
    const readinessMocks = String.raw`
$ErrorActionPreference = 'Stop'
function Get-Command {
    param($Name, $ErrorAction)
    $source = switch ($Name) {
        'powershell.exe' { 'Invoke-MockJava' }
        'node.exe' { 'Invoke-MockProbe' }
        'pm2' { 'forbidden-pm2-cli' }
        default { throw 'Unexpected command discovery' }
    }
    [pscustomobject]@{ Source = $source }
}
function Invoke-MockJava { $global:LASTEXITCODE = 0 }
function Invoke-MockProbe {
    $global:LASTEXITCODE = [int]$env:ADC_TEST_PROBE_EXIT
    if ($global:LASTEXITCODE -ne 0) { Write-Output 'PM2-mock-EPERM' }
}
function Get-Item {
    param($LiteralPath, [switch]$Force, $ErrorAction)
    if ($env:ADC_TEST_LOCATIONS -eq 'absent') { throw 'Fixture location absent' }
    $isDirectory = $LiteralPath -eq $env:ADC_TEST_LOG_DIRECTORY
    [pscustomobject]@{ FullName = $LiteralPath; PSIsContainer = $isDirectory; Extension = '.properties' }
}
function Test-Path { param($LiteralPath, $PathType); return $true }
function Get-NetTCPConnection {
    param($State, $ErrorAction)
    if ($env:ADC_TEST_BIND -eq 'unreadable') { throw 'Fixture discovery denied' }
    if ($env:ADC_TEST_BIND -ne 'none') {
        [pscustomobject]@{ LocalPort = 28081; LocalAddress = $env:ADC_TEST_BIND }
    }
}
& $env:ADC_TEST_READINESS_SCRIPT -ConfigurationPath $env:ADC_TEST_CONFIGURATION_PATH -LogDirectory $env:ADC_TEST_LOG_DIRECTORY -FrontendApiBaseUrl 'https://api-formulario.rodogarcia.com.br/api/v1'
`;
    for (const scenario of [
      {
        locations: "present",
        probe: 0,
        bind: "none",
        exit: 0,
        message: "Sem listener",
      },
      {
        locations: "present",
        probe: 0,
        bind: "none",
        incomplete: true,
        exit: 1,
        message: "BLOQUEADO: Configuracao preparada completa",
      },
      {
        locations: "absent",
        probe: 1,
        bind: "none",
        exit: 1,
        message: "BLOQUEADO: Configuracao externa",
      },
      {
        locations: "present",
        probe: 0,
        bind: "127.0.0.1",
        exit: 1,
        message: "Ocupada; exige conferencia",
      },
      {
        locations: "present",
        probe: 0,
        bind: "0.0.0.0",
        exit: 1,
        message: "Listener fora do loopback",
      },
      {
        locations: "present",
        probe: 0,
        bind: "::",
        exit: 1,
        message: "Listener fora do loopback",
      },
      {
        locations: "present",
        probe: 0,
        bind: "unreadable",
        exit: 1,
        message: "BLOQUEADO: Leitura das portas privadas",
      },
    ]) {
      fs.writeFileSync(
        configurationFixture,
        scenario.incomplete
          ? "#ADC_CONFIGURATION_INCOMPLETE\nsynthetic=true\n"
          : "# Synthetic fixture with no credentials\nsynthetic=true\n",
      );
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-Command", readinessMocks],
        {
          encoding: "utf8",
          windowsHide: true,
          env: {
            ...process.env,
            ADC_TEST_READINESS_SCRIPT: path.join(
              __dirname,
              "check-production-readiness.ps1",
            ),
            ADC_TEST_LOCATIONS: scenario.locations,
            ADC_TEST_CONFIGURATION_PATH: configurationFixture,
            ADC_TEST_LOG_DIRECTORY: logFixture,
            ADC_TEST_PROBE_EXIT: String(scenario.probe),
            ADC_TEST_BIND: scenario.bind,
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, scenario.exit, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(scenario.message), result.stdout);
      if (scenario.locations === "absent") {
        assert.match(result.stdout, /BLOQUEADO: Diretorio de logs/);
        assert.match(result.stdout, /BLOQUEADO: Canal do daemon PM2 existente/);
      }
      cases++;
    }
    fs.copyFileSync(
      path.join(repositoryRoot, "iniciar-prod.bat"),
      path.join(fixtureRoot, "iniciar-prod.bat"),
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "powershell.cmd"),
      [
        "@echo off",
        'if /i not "%~nx5"=="check-production-readiness.ps1" exit /b 99',
        "echo readiness-mock",
        "exit /b %ADC_TEST_READINESS_EXIT%",
        "",
      ].join("\r\n"),
    );
    for (const command of ["pm2", "node", "npm"]) {
      fs.writeFileSync(
        path.join(fixtureRoot, `${command}.cmd`),
        '@echo off\r\necho forbidden-cli>"%~dp0unexpected-cli.txt"\r\nexit /b 99\r\n',
      );
    }
    for (const expectedExit of [0, 1]) {
      const result = spawnSync(
        process.env.ComSpec,
        ["/d", "/c", "iniciar-prod.bat --check"],
        {
          cwd: fixtureRoot,
          encoding: "utf8",
          windowsHide: true,
          env: {
            ...process.env,
            PATH: fixtureRoot + ";" + process.env.PATH,
            AVALIACAO_DESEMPENHO_ENV_LOADED: "1",
            ADC_TEST_READINESS_EXIT: String(expectedExit),
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, expectedExit, result.stdout + result.stderr);
      assert.match(result.stdout, /readiness-mock/);
      assert.equal(
        fs.existsSync(path.join(fixtureRoot, "unexpected-cli.txt")),
        false,
      );
      cases++;
    }
  } finally {
    // Remove only the fixture created by this test, after validating its boundary.
    const fixturePath = fs.realpathSync(fixtureRoot);
    const temporaryPath = fs.realpathSync(os.tmpdir()) + path.sep;
    assert.ok(fixturePath.startsWith(temporaryPath));
    assert.ok(path.basename(fixturePath).startsWith("adc-launcher-check-"));
    fs.rmSync(fixturePath, { recursive: true });
  }
}
console.log(
  `Launcher PROD validado: ${cases} cenarios simulados, sem SQL ou PM2 real.`,
);
