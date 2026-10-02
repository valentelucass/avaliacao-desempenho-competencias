const net = require("node:net");
const requireExistingDaemon = process.argv.includes("--require-existing");

// Connect only to the existing daemon; do not spawn or restart PM2.
if (process.platform === "win32") {
  const socket = net.connect("\\\\.\\pipe\\rpc.sock");
  socket.on("connect", () => socket.destroy());
  socket.on("error", (error) => {
    if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
      if (requireExistingDaemon) {
        console.error(
          "[Avaliacao PROD] Nenhum daemon PM2 acessivel. " +
            "A verificacao nao inicia um novo daemon.",
        );
        process.exitCode = 1;
      }
      return;
    }
    console.error(
      "[Avaliacao PROD] Sem acesso ao PM2 existente (" +
        error.code +
        "). " +
        "Confira a propriedade do canal e os daemons ativos antes de alterar o runtime. " +
        "Nenhum processo foi reiniciado.",
    );
    process.exitCode = 1;
  });
  socket.setTimeout(3000, () => {
    console.error(
      "[Avaliacao PROD] O canal do PM2 nao respondeu em 3 segundos.",
    );
    process.exitCode = 1;
    socket.destroy();
  });
} else if (requireExistingDaemon) {
  console.error("[Avaliacao PROD] A verificacao do canal PM2 requer Windows.");
  process.exitCode = 1;
}
