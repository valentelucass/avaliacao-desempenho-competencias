const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const requiredVariables = {
  ADC_PM2_BACKEND_HOST: "127.0.0.1",
  ADC_PM2_BACKEND_PORT: "18081",
  ADC_PM2_FRONTEND_HOST: "127.0.0.1",
  ADC_PM2_FRONTEND_PORT: "18080",
  ADC_PM2_BACKEND_JAR: path.join(
    repositoryRoot,
    "backend",
    "target",
    "application.jar",
  ),
  ADC_PM2_JAVA_EXECUTABLE: path.join("C:\\", "runtime", "java.exe"),
  ADC_PM2_NODE_EXECUTABLE: path.join("C:\\", "runtime", "node.exe"),
  ADC_PM2_VITE_CLI: path.join(
    repositoryRoot,
    "frontend",
    "node_modules",
    "vite",
    "bin",
    "vite.js",
  ),
  ADC_PM2_PRODUCTION_CONFIG_PATH: path.join(
    "C:\\",
    "config",
    "application.properties",
  ),
  ADC_PM2_PRODUCTION_LOG_DIRECTORY: path.join("C:\\", "logs"),
  // Simula uma opção arbitrária herdada. O manifesto deve ignorá-la e usar
  // somente o valor fixo necessário para validar o certificado do SQL Server.
  JAVA_TOOL_OPTIONS: "-Dadc.inherited.option.must.not.escape=true",
  SystemRoot: path.join("C:\\", "Windows"),
  WINDIR: path.join("C:\\", "Windows"),
  TEMP: path.join("C:\\", "Temp"),
  TMP: path.join("C:\\", "Temp"),
};

Object.assign(process.env, requiredVariables);

const manifestPath = path.join(repositoryRoot, "ecosystem.config.cjs");
delete require.cache[require.resolve(manifestPath)];
const manifest = require(manifestPath);

if (!Array.isArray(manifest.apps) || manifest.apps.length !== 2) {
  throw new Error(
    "O manifesto PM2 deve declarar exatamente os dois processos do projeto.",
  );
}

const expectedEnvironmentKeys = {
  "avaliacao-api-18081": [
    "JAVA_TOOL_OPTIONS",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ],
  "avaliacao-front-18080": [
    "NODE_ENV",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ],
};

for (const app of manifest.apps) {
  if (!(app.name in expectedEnvironmentKeys)) {
    throw new Error(
      "O manifesto PM2 contém um processo fora do escopo do projeto.",
    );
  }
  if (
    !Array.isArray(app.filter_env) ||
    app.filter_env.length !== 1 ||
    app.filter_env[0] !== ""
  ) {
    throw new Error(
      "Cada processo PM2 deve remover integralmente o ambiente global herdado.",
    );
  }
  if (
    !path.isAbsolute(app.script) ||
    app.interpreter !== "none" ||
    app.windowsHide !== true
  ) {
    throw new Error(
      "Executável, interpretador ou isolamento de janela do PM2 estão inválidos.",
    );
  }

  const actualKeys = Object.keys(app.env).sort();
  const expectedKeys = expectedEnvironmentKeys[app.name].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      "O ambiente explícito de um processo PM2 contém chave ausente ou inesperada.",
    );
  }

  if (
    app.name === "avaliacao-api-18081" &&
    app.env.JAVA_TOOL_OPTIONS !==
      "-Djavax.net.ssl.trustStoreType=Windows-ROOT"
  ) {
    throw new Error(
      "O processo Java deve receber somente a opção de truststore autorizada.",
    );
  }
}

process.stdout.write(
  "Manifesto PM2 validado com ambiente mínimo e dois processos isolados.\n",
);
