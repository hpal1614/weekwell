import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';

const files = await readdir('src');
// Syntax-check every script before copying, so a typo fails the build instead of the page.
for (const file of files.filter((f) => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', `src/${file}`], { stdio: 'inherit' });
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src', 'dist', { recursive: true });
console.log(`Built app into dist/ (${files.length} files)`);
