import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const MIN_TEXT_PATTERN = /text-\[(?:9|10|11)px\]/;
const LOW_CONTRAST_PATTERN = /text-zinc-500/;

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (entry === 'test') {
        return [];
      }
      return walkFiles(fullPath);
    }

    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
      return [];
    }

    return [fullPath];
  });
}

describe('web accessibility utility classes', () => {
  it('does not leave sub-12px text classes in production source files', () => {
    const offenders = walkFiles(SRC_DIR)
      .filter((file) => MIN_TEXT_PATTERN.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('does not use zinc-500 for tertiary dark-theme text', () => {
    const offenders = walkFiles(SRC_DIR)
      .filter((file) => LOW_CONTRAST_PATTERN.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
