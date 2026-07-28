#!/usr/bin/env node
// Cross-platform production start: build the UI if it hasn't been built yet,
// then run the server (which serves both the API and the built UI).
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = path.join(root, 'client', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.log('Building the UI (first run only)...');
  const build = spawnSync('npm', ['run', 'build', '-w', 'client'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn('node', [path.join(root, 'server', 'index.js')], {
  cwd: root,
  stdio: 'inherit',
});
server.on('exit', (code) => process.exit(code ?? 0));
