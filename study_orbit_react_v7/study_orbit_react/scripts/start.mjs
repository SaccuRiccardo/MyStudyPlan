import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDependencies } from "./ensure-dependencies.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = "http://127.0.0.1:5173/";
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
  process.exitCode = code;
}
function child(args) {
  const processChild = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  children.add(processChild);
  processChild.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  processChild.on("exit", () => {
    children.delete(processChild);
    if (!stopping) {
      console.error("A Study Orbit service stopped unexpectedly.");
      stop(1);
    }
  });
}
async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) =>
      reject(
        new Error(
          `Cannot use port ${port}: ${error.message}. Stop the other Study Orbit window, then retry.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
async function start() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!(major > 20 || (major === 20 && minor >= 19)))
    throw new Error("Install Node.js >=20.19 (current LTS recommended).");
  if (
    process.env.STUDY_ORBIT_API_PORT &&
    process.env.STUDY_ORBIT_API_PORT !== "8766"
  )
    throw new Error("The launcher requires STUDY_ORBIT_API_PORT=8766.");
  await checkPort(8766);
  await checkPort(5173);
  ensureDependencies();
  process.on("SIGINT", () => stop());
  process.on("SIGTERM", () => stop());
  child(["server/index.js"]);
  child([
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ]);
  let ready = false;
  for (let i = 0; i < 100 && !stopping; i++) {
    try {
      const health = await fetch("http://127.0.0.1:8766/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      const frontend = await fetch(url, { signal: AbortSignal.timeout(1000) });
      ready = health.ok && (await health.json()).ok === true && frontend.ok;
    } catch {
      /* Servers may still be starting. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (stopping) return;
  if (!ready)
    throw new Error(
      "Services did not become ready. Check the startup messages above.",
    );
  console.log(
    `\nStudy Orbit: ${url}\nLeave this window open. Press Ctrl+C to stop.\nStudy data: ${process.env.STUDY_ORBIT_DATA_ROOT || root}`,
  );
  if (!process.argv.includes("--no-open")) {
    const command =
      process.platform === "win32"
        ? "cmd.exe"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", `start "" "${url}"`]
        : [url];
    const opener = spawn(command, args, {
      stdio: "ignore",
      windowsVerbatimArguments: process.platform === "win32",
    });
    opener.on("error", () => console.log(`Open ${url} in your browser.`));
    opener.on("exit", (code) => {
      if (code) console.log(`Open ${url} in your browser.`);
    });
  }
}
start().catch((error) => {
  console.error(`Study Orbit could not start: ${error.message}`);
  stop(1);
});
