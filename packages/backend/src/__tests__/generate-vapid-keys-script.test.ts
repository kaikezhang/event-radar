import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = new URL('../../scripts/generate-vapid-keys.sh', import.meta.url);

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'event-radar-vapid-'));
  tempDirs.push(dir);
  return dir;
}

function installFakeNpx(output: string, exitCode = 0): string {
  const dir = makeTempDir();
  const fakeNpxPath = join(dir, 'npx');
  writeFileSync(fakeNpxPath, `#!/usr/bin/env bash\ncat <<'EOF'\n${output}\nEOF\nexit ${exitCode}\n`);
  chmodSync(fakeNpxPath, 0o755);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('generate-vapid-keys.sh', () => {
  it('prints .env-ready backend and web push keys from the web-push CLI output', () => {
    const fakeBin = installFakeNpx(`=======================================

Public Key:
PUBLIC_TEST_KEY

Private Key:
PRIVATE_TEST_KEY
`);

    const output = execFileSync('bash', [scriptPath.pathname], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        WEB_PUSH_VAPID_SUBJECT: 'mailto:alerts@example.com',
      },
    });

    expect(output).toContain('WEB_PUSH_VAPID_SUBJECT=mailto:alerts@example.com');
    expect(output).toContain('WEB_PUSH_VAPID_PUBLIC_KEY=PUBLIC_TEST_KEY');
    expect(output).toContain('WEB_PUSH_VAPID_PRIVATE_KEY=PRIVATE_TEST_KEY');
    expect(output).toContain('VITE_WEB_PUSH_PUBLIC_KEY=PUBLIC_TEST_KEY');
  });

  it('reuses existing VAPID env vars without calling the generator again', () => {
    const fakeBin = installFakeNpx('generator should not run', 99);

    const output = execFileSync('bash', [scriptPath.pathname], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        WEB_PUSH_VAPID_SUBJECT: 'mailto:existing@example.com',
        WEB_PUSH_VAPID_PUBLIC_KEY: 'EXISTING_PUBLIC',
        WEB_PUSH_VAPID_PRIVATE_KEY: 'EXISTING_PRIVATE',
      },
    });

    expect(output).toContain('WEB_PUSH_VAPID_SUBJECT=mailto:existing@example.com');
    expect(output).toContain('WEB_PUSH_VAPID_PUBLIC_KEY=EXISTING_PUBLIC');
    expect(output).toContain('WEB_PUSH_VAPID_PRIVATE_KEY=EXISTING_PRIVATE');
    expect(output).toContain('VITE_WEB_PUSH_PUBLIC_KEY=EXISTING_PUBLIC');
  });
});
