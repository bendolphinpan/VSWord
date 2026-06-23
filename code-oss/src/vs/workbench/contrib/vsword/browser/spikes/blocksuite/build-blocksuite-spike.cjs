#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * VSWord BlockSuite spike local bundle builder.
 *
 * Dev-only. Do not use this as production dependency approval.
 * It intentionally installs dependencies into D:/GIT/VSWord/.tmp/blocksuite-spike-builder
 * and writes the generated bundle to vendor/index.js, which is gitignored.
 *--------------------------------------------------------------------------------------------*/

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../../../../../../..');
const builderDir = path.join(repoRoot, '.tmp', 'blocksuite-spike-builder');
const spikeDir = __dirname;
const vendorDir = path.join(spikeDir, 'vendor');
const entryPath = path.join(builderDir, 'entry.js');
const bundlePath = path.join(vendorDir, 'index.js');
const thirdPartyPath = path.join(vendorDir, 'THIRD_PARTY_LICENSES.md');

function run(command, cwd = builderDir) {
	console.log(`[blocksuite-spike] ${command}`);
	childProcess.execSync(command, { cwd, stdio: 'inherit', shell: true });
}

fs.mkdirSync(builderDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

if (!fs.existsSync(path.join(builderDir, 'package.json'))) {
	run('npm init -y >/dev/null');
}

fs.writeFileSync(entryPath, `import { createEmptyDoc, EdgelessEditor } from '@blocksuite/presets';
import { effects } from '@blocksuite/presets/effects';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

function report(type, payload = {}) {
  vscode?.postMessage?.({ type, ...payload });
}

function boot() {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app');
  root.innerHTML = '';

  const badge = document.createElement('div');
  badge.className = 'spike-badge';
  badge.textContent = 'BlockSuite Edgeless Spike · MPL dev-only · SVG canvas untouched';
  root.appendChild(badge);

  const mount = document.createElement('div');
  mount.className = 'editor-mount';
  root.appendChild(mount);

  try {
    effects();
    const doc = createEmptyDoc().init();
    const editor = new EdgelessEditor();
    editor.doc = doc;
    editor.style.width = '100%';
    editor.style.height = '100%';
    mount.appendChild(editor);
    report('ready', { package: '@blocksuite/presets@0.19.5' });
  } catch (err) {
    console.error('[VSWord BlockSuite Spike] boot failed', err);
    mount.innerHTML = '<pre class="spike-error"></pre>';
    mount.querySelector('pre').textContent = String(err && err.stack || err);
    report('error', { message: String(err && err.message || err) });
  }
}

boot();
`, 'utf8');

run('npm install @blocksuite/presets@0.19.5 esbuild@0.27.0 --prefer-offline --no-audit --no-fund');
// @blocksuite/presets@0.19.5 currently floats to @blocksuite/icons@2.2.17, whose exports break older imports.
// Pin in the temporary builder only; do not patch or vendor upstream source.
run('npm install @blocksuite/icons@2.1.75 --prefer-offline --no-audit --no-fund');
run(`npx esbuild ${JSON.stringify(entryPath)} --bundle --format=esm --target=es2022 --outfile=${JSON.stringify(bundlePath)} --log-level=info`);

const lock = JSON.parse(fs.readFileSync(path.join(builderDir, 'package-lock.json'), 'utf8'));
const rows = [];
for (const [pkgPath, pkg] of Object.entries(lock.packages || {})) {
	if (!pkgPath.startsWith('node_modules/')) continue;
	rows.push({ name: pkgPath.slice('node_modules/'.length), version: pkg.version || '', license: pkg.license || 'UNKNOWN' });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
const byLicense = {};
for (const row of rows) byLicense[row.license] = (byLicense[row.license] || 0) + 1;
let out = '# BlockSuite Spike Third-Party License Snapshot\n\n';
out += 'Generated from the temporary builder lockfile under `.tmp/blocksuite-spike-builder`. This file documents the dev-only spike bundle; it is not a production dependency approval.\n\n';
out += '## License summary\n\n';
for (const [license, count] of Object.entries(byLicense).sort()) out += `- ${license}: ${count}\n`;
out += '\n## Important notes\n\n';
out += '- The visual spike bundle is generated from `@blocksuite/presets@0.19.5`, which is MPL-2.0.\n';
out += '- `@blocksuite/blocks@0.19.5` is also MPL-2.0 and is included transitively.\n';
out += '- `@blocksuite/icons` is pinned to `2.1.75` in the temporary builder because latest `2.2.17` breaks `@blocksuite/presets@0.19.5` imports (`CheckBoxCkeckSolidIcon`).\n';
out += '- Do not modify or vendor upstream BlockSuite source files. If this ever moves beyond spike, add proper third-party notices/source availability handling first.\n';
out += '- Production should prefer the newer MIT-only `@blocksuite/affine@0.22.x` route if we can assemble an editor from modular packages.\n\n';
out += '## Package list\n\n| Package | Version | License |\n|---|---:|---|\n';
for (const row of rows) out += `| ${row.name} | ${row.version} | ${row.license} |\n`;
fs.writeFileSync(thirdPartyPath, out, 'utf8');
console.log(`[blocksuite-spike] wrote ${bundlePath}`);
console.log(`[blocksuite-spike] wrote ${thirdPartyPath}`);
