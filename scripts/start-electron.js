const { spawn } = require("node:child_process");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_FORCE_IS_PACKAGED;

const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  windowsHide: false
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
