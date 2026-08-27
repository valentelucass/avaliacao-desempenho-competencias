const path = require("node:path");

const repositoryRoot = __dirname;
const backendDirectory = path.join(repositoryRoot, "backend");
const frontendDirectory = path.join(repositoryRoot, "frontend");

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `A variável ${name} é obrigatória para iniciar o PM2 de produção.`,
    );
  }
  return value;
}

const backendProcess = "avaliacao-desempenho-backend-prod";
const frontendProcess = "avaliacao-desempenho-frontend-prod";
const backendHost = requiredEnvironment("ADC_PM2_BACKEND_HOST");
const backendPort = requiredEnvironment("ADC_PM2_BACKEND_PORT");
const frontendHost = requiredEnvironment("ADC_PM2_FRONTEND_HOST");
const frontendPort = requiredEnvironment("ADC_PM2_FRONTEND_PORT");
const backendJar = requiredEnvironment("ADC_PM2_BACKEND_JAR");
const javaExecutable = requiredEnvironment("ADC_PM2_JAVA_EXECUTABLE");
const nodeExecutable = requiredEnvironment("ADC_PM2_NODE_EXECUTABLE");
const viteCli = requiredEnvironment("ADC_PM2_VITE_CLI");
const productionConfigPath = requiredEnvironment(
  "ADC_PM2_PRODUCTION_CONFIG_PATH",
);
const productionLogDirectory = requiredEnvironment(
  "ADC_PM2_PRODUCTION_LOG_DIRECTORY",
);
const javaToolOptions = requiredEnvironment("JAVA_TOOL_OPTIONS");

const sharedProcessOptions = {
  autorestart: true,
  exp_backoff_restart_delay: 3000,
  max_restarts: 10,
  min_uptime: "10s",
  time: true,
  windowsHide: true,
};

module.exports = {
  apps: [
    {
      ...sharedProcessOptions,
      name: backendProcess,
      cwd: backendDirectory,
      script: javaExecutable,
      interpreter: "none",
      args: [
        "-jar",
        backendJar,
        `--spring.config.additional-location=optional:file:${productionConfigPath}`,
        `--server.address=${backendHost}`,
        `--server.port=${backendPort}`,
      ],
      out_file: path.join(productionLogDirectory, `${backendProcess}-out.log`),
      error_file: path.join(
        productionLogDirectory,
        `${backendProcess}-error.log`,
      ),
      env: {
        JAVA_TOOL_OPTIONS: javaToolOptions,
      },
    },
    {
      ...sharedProcessOptions,
      name: frontendProcess,
      cwd: frontendDirectory,
      script: nodeExecutable,
      interpreter: "none",
      args: [
        viteCli,
        "preview",
        "--host",
        frontendHost,
        "--port",
        frontendPort,
        "--strictPort",
      ],
      out_file: path.join(productionLogDirectory, `${frontendProcess}-out.log`),
      error_file: path.join(
        productionLogDirectory,
        `${frontendProcess}-error.log`,
      ),
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
