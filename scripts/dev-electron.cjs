const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const waitOn = require('wait-on');

const ROOT = path.resolve(__dirname, '..');
const WATCH_DIR = path.join(ROOT, 'electron');
const APP_URL = 'http://localhost:5173';

let electronProcess = null;
let restarting = false;
let restartTimer = null;
let manualShutdown = false;

function log(message) {
  process.stdout.write(`[dev-electron] ${message}\n`);
}

function spawnElectron() {
  const electronBinary = require('electron');
  electronProcess = spawn(electronBinary, ['.'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: APP_URL
    }
  });

  electronProcess.on('exit', (code, signal) => {
    const closedByRestart = restarting;
    electronProcess = null;

    if (manualShutdown) return;
    if (closedByRestart) {
      restarting = false;
      spawnElectron();
      return;
    }

    log(`Electron 已退出${signal ? ` (${signal})` : code != null ? ` (code ${code})` : ''}，监听器继续运行`);
  });
}

function stopElectron() {
  if (!electronProcess) return Promise.resolve();

  return new Promise((resolve) => {
    const target = electronProcess;
    const done = () => resolve();

    target.once('exit', done);
    target.kill('SIGTERM');

    setTimeout(() => {
      if (target.exitCode == null && !target.killed) {
        target.kill('SIGKILL');
      }
    }, 2000);
  });
}

async function restartElectron(reason) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    if (manualShutdown) return;
    log(`检测到 ${reason} 变更，重启 Electron...`);
    restarting = true;
    await stopElectron();
    if (!electronProcess && restarting) {
      restarting = false;
      spawnElectron();
    }
  }, 180);
}

function attachWatchers() {
  const watchers = [];

  function watchDir(dir) {
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (!filename) return;
      if (filename.endsWith('.swp') || filename.endsWith('.tmp')) return;
      restartElectron(path.relative(ROOT, path.join(dir, filename)));
    });
    watchers.push(watcher);

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        watchDir(path.join(dir, entry.name));
      }
    }
  }

  watchDir(WATCH_DIR);
  return watchers;
}

async function main() {
  log('等待 Vite 开发服务器...');
  await waitOn({ resources: ['tcp:5173'], timeout: 60000 });
  log('Vite 已就绪，启动 Electron');

  const watchers = attachWatchers();
  spawnElectron();

  const shutdown = async () => {
    if (manualShutdown) return;
    manualShutdown = true;
    for (const watcher of watchers) {
      watcher.close();
    }
    await stopElectron();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[dev-electron] 启动失败:', error);
  process.exit(1);
});
