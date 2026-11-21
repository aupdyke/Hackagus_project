// Windows fix: when the cwd uses a lowercase drive letter (VS Code opens `c:\...`), Vitest loads two copies
// of itself and fails with "Vitest failed to find the current suite". Normalise to `C:\` and run vitest.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url))).replace(/^[a-z]:/, (d) => d.toUpperCase());
const bin = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
