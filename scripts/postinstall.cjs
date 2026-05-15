#!/usr/bin/env node
/**
 * Apply local patches to node_modules after install.
 * 
 * Patches are stored in patches/ as .patch files named after the package:
 *   patches/@scope+package+version.patch
 * 
 * Each patch is applied relative to the package directory in node_modules.
 * The patch header uses paths relative to the package root (a/dist/... b/dist/...).
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const patchesDir = path.join(rootDir, 'patches');

if (!fs.existsSync(patchesDir)) {
  console.log('📭 No patches directory found, skipping.');
  process.exit(0);
}

const patches = fs.readdirSync(patchesDir).filter((f) => f.endsWith('.patch'));

for (const patch of patches) {
  // Parse: @scope+package+version.patch → @scope/package → node_modules/@scope/package
  const base = patch.replace('.patch', '');
  // Split on + — first segment may contain nested @
  // @mariozechner+pi-ai+0.73.1 → scope=@mariozechner, name=pi-ai, version=0.73.1
  const parts = base.split('+');
  const pkgDir = path.join(rootDir, 'node_modules', parts.slice(0, -1).join('/'));
  const patchPath = path.join(patchesDir, patch);

  if (!fs.existsSync(pkgDir)) {
    console.log(`⚠ Package directory not found: ${pkgDir}`);
    continue;
  }

  console.log(`🩹 Applying patch: ${patch}`);
  try {
    // --no-backup-if-mismatch: don't create .orig files
    // -p1: strip one path component (a/dist/... → dist/...)
    execSync(`patch -p1 --forward --no-backup-if-mismatch < "${patchPath}"`, {
      cwd: pkgDir,
      stdio: 'pipe',
    });
    console.log(`  ✅ Applied ${patch}`);
  } catch (e) {
    console.log(`  ⚠ ${patch} — may already be applied`);
  }
}

console.log('🩹 All patches processed.');