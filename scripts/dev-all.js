// scripts/dev-all.js
// Runs both the Express psychometric API (port 4000) and Next.js (port 3000)
// for local development.

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'psychometric-ai');

console.log('[dev-all] Starting Psychometric AI local development environment...');
console.log('[dev-all] 1. Backend: Express API on http://localhost:4000');
console.log('[dev-all] 2. Frontend: Next.js on http://localhost:3000');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

// 1. Start backend
const api = spawn(npmCmd, ['run', 'dev'], {
  cwd: apiDir,
  env: {
    ...process.env,
    PORT: '4000',
    NODE_ENV: 'development',
    DB_DRIVER: 'sqlite',
    SEED_DEMO_DATA: 'true',
    LLM_PROVIDER: process.env.LLM_PROVIDER || 'auto',
  },
  stdio: 'inherit',
  shell: true,
});

// 2. Start frontend
const fe = spawn(npmCmd, ['run', 'dev:fe'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: '3000',
    PSYCHOMETRIC_BACKEND_URL: 'http://127.0.0.1:4000',
  },
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\n[dev-all] Shutting down services...');
  if (isWin) {
    spawn('taskkill', ['/pid', api.pid, '/f', '/t']);
    spawn('taskkill', ['/pid', fe.pid, '/f', '/t']);
  } else {
    api.kill('SIGINT');
    fe.kill('SIGINT');
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

