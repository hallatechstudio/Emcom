import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Free-tier/demo entrypoint: run the HTTP API and durable notification worker in one container.
 * Production deployments should continue to run dist/main.js and dist/worker.js separately so
 * they can be scaled and restarted independently.
 */
const children = new Set<ChildProcess>();
let shuttingDown = false;

function start(entrypoint: 'main.js' | 'worker.js'): ChildProcess {
  const child = spawn(process.execPath, [resolve(__dirname, entrypoint)], {
    env: process.env,
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    console.error(`${entrypoint} exited unexpectedly (${signal ?? code ?? 'unknown'})`);
    void shutdown('SIGTERM', code ?? 1);
  });
  return child;
}

function shutdown(signal: NodeJS.Signals, exitCode = 0): Promise<void> {
  if (shuttingDown) return Promise.resolve();
  shuttingDown = true;
  for (const child of children) child.kill(signal);
  return new Promise((done) => {
    const timer = setTimeout(() => {
      for (const child of children) child.kill('SIGKILL');
      process.exit(exitCode);
    }, 30_000);
    timer.unref();

    const check = () => {
      if (children.size > 0) return;
      clearTimeout(timer);
      done();
      process.exit(exitCode);
    };
    for (const child of children) child.once('exit', check);
    check();
  });
}

start('main.js');
start('worker.js');

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
