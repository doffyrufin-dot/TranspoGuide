import { rmSync } from 'node:fs';

const filesToRemove = [
  '.next/cache/.tsbuildinfo',
  'tsconfig.tsbuildinfo',
];

for (const filePath of filesToRemove) {
  try {
    rmSync(filePath, { force: true });
    console.log(`[prebuild] removed ${filePath}`);
  } catch (error) {
    console.warn(`[prebuild] skip ${filePath}:`, error?.message || error);
  }
}
