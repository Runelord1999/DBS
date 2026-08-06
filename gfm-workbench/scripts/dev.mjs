#!/usr/bin/env node
/**
 * Runs the API and the Vite dev server together with prefixed output.
 * Deliberately dependency-free — no concurrently, no nodemon.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const targets = [
  { name: 'api', color: '\x1b[36m', args: ['--workspace', 'server', 'run', 'dev'] },
  { name: 'web', color: '\x1b[35m', args: ['--workspace', 'web', 'run', 'dev'] },
];

const children = targets.map(({ name, color, args }) => {
  const child = spawn(npm, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `${color}[${name}]\x1b[0m `;
  const write = (stream) => (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim()) stream.write(prefix + line + '\n');
    }
  };
  child.stdout.on('data', write(process.stdout));
  child.stderr.on('data', write(process.stderr));
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown();
  });
  return child;
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
