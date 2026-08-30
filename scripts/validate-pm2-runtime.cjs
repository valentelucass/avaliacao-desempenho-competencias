const fs = require("node:fs");
const path = require("node:path");

const chunks = [];

process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const applications = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const expected = {
    "avaliacao-api-18081": {
      keys: ["JAVA_TOOL_OPTIONS", "SystemRoot", "TEMP", "TMP", "WINDIR"],
      values: {
        JAVA_TOOL_OPTIONS: "-Djavax.net.ssl.trustStoreType=Windows-ROOT",
      },
    },
    "avaliacao-front-18080": {
      keys: ["NODE_ENV", "SystemRoot", "TEMP", "TMP", "WINDIR"],
      values: { NODE_ENV: "production" },
    },
  };

  const projectApplications = applications.filter((application) =>
    Object.hasOwn(expected, application.name),
  );
  if (projectApplications.length !== 2) {
    throw new Error("O PM2 deve conter exatamente os dois processos do projeto.");
  }

  const result = projectApplications.map((application) => {
    const specification = expected[application.name];
    const runtimeEnvironment = application.pm2_env?.env;
    if (!runtimeEnvironment || typeof runtimeEnvironment !== "object") {
      throw new Error("O PM2 não expôs o ambiente estruturado do processo.");
    }

    const actualKeys = Object.keys(runtimeEnvironment).sort();
    const expectedKeys = [
      ...specification.keys,
      "PM2_HOME",
      "unique_id",
      application.name,
    ].sort();
    const unexpectedKeys = actualKeys.filter(
      (key) => !expectedKeys.includes(key),
    );
    const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
    const invalidValues = Object.entries(specification.values).filter(
      ([key, value]) => runtimeEnvironment[key] !== value,
    );
    const moduleConfiguration = runtimeEnvironment[application.name];
    const pm2MetadataValid =
      typeof runtimeEnvironment.PM2_HOME === "string" &&
      runtimeEnvironment.PM2_HOME.length > 0 &&
      typeof runtimeEnvironment.unique_id === "string" &&
      /^[0-9a-f-]{36}$/i.test(runtimeEnvironment.unique_id) &&
      ((moduleConfiguration &&
        typeof moduleConfiguration === "object" &&
        Object.keys(moduleConfiguration).length === 0) ||
        moduleConfiguration === "{}");
    const argumentsList = application.pm2_env?.args;
    const repositoryRoot = path.resolve(__dirname, "..");
    const releaseRoot = `${path.join(
      repositoryRoot,
      "backend",
      "target",
      "releases",
    )}${path.sep}`;
    const backendJar = Array.isArray(argumentsList) ? argumentsList[1] : "";
    const launchContractValid =
      Array.isArray(application.pm2_env?.filter_env) &&
      application.pm2_env.filter_env.length === 1 &&
      application.pm2_env.filter_env[0] === "" &&
      (application.name === "avaliacao-api-18081"
        ? Array.isArray(argumentsList) &&
          argumentsList[0] === "-jar" &&
          typeof backendJar === "string" &&
          path.resolve(backendJar).startsWith(releaseRoot) &&
          /^avaliacao-desempenho-api-.+\.jar$/.test(path.basename(backendJar)) &&
          fs.existsSync(backendJar) &&
          argumentsList.includes("--server.address=127.0.0.1") &&
          argumentsList.includes("--server.port=18081") &&
          String(application.pm2_env.pm_exec_path)
            .toLowerCase()
            .endsWith(`${path.sep}java.exe`)
        : Array.isArray(argumentsList) &&
          argumentsList.includes("preview") &&
          argumentsList.includes("--host") &&
          argumentsList.includes("127.0.0.1") &&
          argumentsList.includes("--port") &&
          argumentsList.includes("18080") &&
          argumentsList.includes("--strictPort") &&
          String(application.pm2_env.pm_exec_path)
            .toLowerCase()
            .endsWith(`${path.sep}node.exe`));
    const logsPresent =
      typeof application.pm2_env.pm_out_log_path === "string" &&
      typeof application.pm2_env.pm_err_log_path === "string" &&
      path.dirname(application.pm2_env.pm_out_log_path) ===
        path.dirname(application.pm2_env.pm_err_log_path) &&
      fs.existsSync(application.pm2_env.pm_out_log_path) &&
      fs.existsSync(application.pm2_env.pm_err_log_path);

    const online = application.pm2_env?.status === "online";
    const pidValid = Number.isInteger(application.pid) && application.pid > 0;

    return {
      name: application.name,
      online,
      pidValid,
      unexpectedEnvironmentKeys: unexpectedKeys.length,
      missingEnvironmentKeys: missingKeys.length,
      invalidEnvironmentValues: invalidValues.length,
      pm2MetadataValid,
      launchContractValid,
      logsPresent,
      valid:
        online &&
        pidValid &&
        unexpectedKeys.length === 0 &&
        missingKeys.length === 0 &&
        invalidValues.length === 0 &&
        pm2MetadataValid &&
        launchContractValid &&
        logsPresent,
    };
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.some((application) => !application.valid)) {
    process.exitCode = 1;
  }
});
