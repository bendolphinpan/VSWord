# VSWord T-4A BlockSuite/Affine Spike

## Goal

Validate whether BlockSuite can provide an Affine-like edgeless canvas inside a Code OSS / VSWord webview without touching the production SVG canvas.

## License policy

- Do **not** copy AFFiNE app source into VSWord.
- Do **not** vendor or modify MPL-covered BlockSuite source files.
- Spike may temporarily use npm-built browser bundles for feasibility only.
- Production path must prefer MIT-only `@blocksuite/affine@0.22.x` if it can be assembled without `@blocksuite/presets` / `@blocksuite/blocks` MPL packages.

## Current package findings

- `@blocksuite/presets@0.19.5`: MPL-2.0, easiest API (`createEmptyDoc`, `EdgelessEditor`). Spike-only.
- `@blocksuite/blocks@0.19.5`: MPL-2.0, core edgeless specs. Spike-only unless legal obligations are accepted.
- `@blocksuite/affine@0.22.4`: MIT, preferred production candidate, but no direct `EdgelessEditor` preset found yet.

## Isolation

This spike registers a separate command:

```text
VSWord Dev: Open BlockSuite Spike
```

It does not register Explorer context menus, does not write `.vsword/canvas.json`, and does not modify the production `canvasHtml.ts` / `vswordCanvasAction.ts` path.

## Verification

1. Generate the local dev-only bundle (writes ignored `vendor/index.js`):
   ```bash
   cd /d/GIT/VSWord/code-oss
   node src/vs/workbench/contrib/vsword/browser/spikes/blocksuite/build-blocksuite-spike.cjs
   ```
2. Run `npm run compile`.
3. Launch Code OSS and run command palette:
   ```text
   VSWord Dev: Open BlockSuite Spike
   ```
4. Expected: a BlockSuite `EdgelessEditor` renders in an independent editor tab.

## Current findings

- The spike bundle was generated locally and `npm run compile` passed with 0 errors.
- `@blocksuite/presets@0.19.5` floats to `@blocksuite/icons@2.2.17`, which currently breaks bundling (`CheckBoxCkeckSolidIcon` import mismatch).
- The local builder pins `@blocksuite/icons@2.1.75` in `.tmp/blocksuite-spike-builder` only. This is not a source patch and is not written to VSWord package files.
- The generated browser bundle is large (~19 MB) and gitignored to avoid accidentally distributing an MPL-covered spike artifact as production code.
