import { spawnSync } from 'node:child_process';

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const command = process.platform === 'win32' ? 'vitest.cmd' : 'vitest';

const result = spawnSync(command, forwardedArgs, {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
