import { existsSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] || "guard";
const repoRoot = realpathSync(resolve(process.cwd()));
const selfPid = process.pid;

if (!existsSync("/proc")) {
  if (mode === "guard") process.exit(0);
  if (mode === "stop") {
    console.log("Preview process stopping is only supported on hosts with /proc.");
    process.exit(0);
  }
}

const processInfoFor = (pid) => {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const ppid = Number(status.match(/^PPid:\s+(\d+)$/m)?.[1] || 0);
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .split("\0")
      .filter(Boolean)
      .join(" ");
    const comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    return {
      pid: Number(pid),
      ppid,
      args: cmdline || comm
    };
  } catch {
    return null;
  }
};

const rows = readdirSync("/proc")
  .filter((entry) => /^\d+$/.test(entry))
  .map(processInfoFor)
  .filter(Boolean);

const processByPid = new Map(rows.map((processInfo) => [processInfo.pid, processInfo]));
const selfAndAncestors = new Set();
for (let pid = selfPid; pid > 0 && !selfAndAncestors.has(pid); ) {
  selfAndAncestors.add(pid);
  pid = processByPid.get(pid)?.ppid || 0;
}

const cwdFor = (pid) => {
  const cwdPath = `/proc/${pid}/cwd`;
  if (!existsSync(cwdPath)) return "";
  try {
    return readlinkSync(cwdPath);
  } catch {
    return "";
  }
};

const sleep = (milliseconds) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
};

const isRepoPreviewProcess = (processInfo) => {
  if (!processInfo || selfAndAncestors.has(processInfo.pid)) return false;
  const args = processInfo.args;
  if (args.includes("preview-processes.mjs")) return false;
  if (/\bnpm\s+run\s+preview:/.test(args)) return false;

  const isNpmPreview = /\bnpm\s+run\s+preview(?:\s|$)/.test(args);
  const isVitePreview = /\bvite(?:\.js)?\s+preview(?:\s|$)/.test(args);
  if (!isNpmPreview && !isVitePreview) return false;

  return cwdFor(processInfo.pid) === repoRoot || args.includes(`${repoRoot}/node_modules/.bin/vite`);
};

const previewProcesses = rows.filter(isRepoPreviewProcess);

if (mode === "guard") {
  if (previewProcesses.length === 0) process.exit(0);

  console.error("A Vite preview process is already serving this repo.");
  console.error("Stop it before building so Vite can safely clean dist/ on mounted workspaces.");
  console.error("");
  for (const processInfo of previewProcesses) {
    console.error(`  pid ${processInfo.pid}: ${processInfo.args}`);
  }
  console.error("");
  console.error("Run: npm run preview:restart");
  console.error("Or:  npm run preview:stop");
  process.exit(1);
}

if (mode !== "stop") {
  console.error(`Unknown preview process mode: ${mode}`);
  process.exit(1);
}

if (previewProcesses.length === 0) {
  console.log("No Echo Shift Vite preview process is running.");
  process.exit(0);
}

const childrenByParent = new Map();
for (const processInfo of rows) {
  const children = childrenByParent.get(processInfo.ppid) || [];
  children.push(processInfo.pid);
  childrenByParent.set(processInfo.ppid, children);
}

const stopSet = new Set();
const addDescendants = (pid) => {
  if (pid === selfPid || stopSet.has(pid)) return;
  stopSet.add(pid);
  for (const child of childrenByParent.get(pid) || []) addDescendants(child);
};

for (const processInfo of previewProcesses) addDescendants(processInfo.pid);

const stopList = [...stopSet]
  .map((pid) => processByPid.get(pid))
  .filter(Boolean)
  .sort((a, b) => b.pid - a.pid);

for (const processInfo of stopList) {
  try {
    process.kill(processInfo.pid, "SIGTERM");
    console.log(`Stopped pid ${processInfo.pid}: ${processInfo.args}`);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

let remainingPids = stopList.map((processInfo) => processInfo.pid).filter(isAlive);
const deadline = Date.now() + 5000;
while (remainingPids.length > 0 && Date.now() < deadline) {
  sleep(100);
  remainingPids = remainingPids.filter(isAlive);
}

if (remainingPids.length > 0) {
  for (const pid of remainingPids) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`Force-stopped pid ${pid}`);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}
