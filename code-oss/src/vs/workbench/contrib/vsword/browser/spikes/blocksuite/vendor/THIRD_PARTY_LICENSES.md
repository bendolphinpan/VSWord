# BlockSuite Spike Third-Party License Snapshot

Generated from the temporary builder lockfile under `.tmp/blocksuite-spike-builder`. This file documents the dev-only spike bundle; it is not a production dependency approval.

## License summary

- (MIT AND Zlib): 1
- (MPL-2.0 OR Apache-2.0): 1
- 0BSD: 1
- Apache-2.0: 2
- BSD-2-Clause: 1
- BSD-3-Clause: 7
- BlueOak-1.0.0: 1
- CC0-1.0: 1
- ISC: 2
- MIT: 185
- MPL-2.0: 16
- UNKNOWN: 1

## Important notes

- The visual spike bundle is generated from `@blocksuite/presets@0.19.5`, which is MPL-2.0.
- `@blocksuite/blocks@0.19.5` is also MPL-2.0 and is included transitively.
- `@blocksuite/icons` is pinned to `2.1.75` in the temporary builder because latest `2.2.17` breaks `@blocksuite/presets@0.19.5` imports (`CheckBoxCkeckSolidIcon`).
- Do not modify or vendor upstream BlockSuite source files. If this ever moves beyond spike, add proper third-party notices/source availability handling first.
- Production should prefer the newer MIT-only `@blocksuite/affine@0.22.x` route if we can assemble an editor from modular packages.

## Package list

| Package | Version | License |
|---|---:|---|
| @blocksuite/affine-block-embed | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-block-list | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-block-paragraph | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-block-surface | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-components | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-components/node_modules/date-fns | 4.4.0 | MIT |
| @blocksuite/affine-model | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-shared | 0.19.5 | MPL-2.0 |
| @blocksuite/affine-widget-scroll-anchoring | 0.19.5 | MPL-2.0 |
| @blocksuite/block-std | 0.19.5 | MPL-2.0 |
| @blocksuite/blocks | 0.19.5 | MPL-2.0 |
| @blocksuite/blocks/node_modules/date-fns | 4.4.0 | MIT |
| @blocksuite/data-view | 0.19.5 | MPL-2.0 |
| @blocksuite/data-view/node_modules/date-fns | 4.4.0 | MIT |
| @blocksuite/global | 0.19.5 | MPL-2.0 |
| @blocksuite/icons | 2.1.75 | MIT |
| @blocksuite/inline | 0.19.5 | MPL-2.0 |
| @blocksuite/presets | 0.19.5 | MPL-2.0 |
| @blocksuite/store | 0.19.5 | MPL-2.0 |
| @blocksuite/sync | 0.19.5 | MPL-2.0 |
| @borewit/text-codec | 0.2.2 | MIT |
| @emotion/hash | 0.9.2 | MIT |
| @esbuild/aix-ppc64 | 0.27.0 | MIT |
| @esbuild/android-arm | 0.27.0 | MIT |
| @esbuild/android-arm64 | 0.27.0 | MIT |
| @esbuild/android-x64 | 0.27.0 | MIT |
| @esbuild/darwin-arm64 | 0.27.0 | MIT |
| @esbuild/darwin-x64 | 0.27.0 | MIT |
| @esbuild/freebsd-arm64 | 0.27.0 | MIT |
| @esbuild/freebsd-x64 | 0.27.0 | MIT |
| @esbuild/linux-arm | 0.27.0 | MIT |
| @esbuild/linux-arm64 | 0.27.0 | MIT |
| @esbuild/linux-ia32 | 0.27.0 | MIT |
| @esbuild/linux-loong64 | 0.27.0 | MIT |
| @esbuild/linux-mips64el | 0.27.0 | MIT |
| @esbuild/linux-ppc64 | 0.27.0 | MIT |
| @esbuild/linux-riscv64 | 0.27.0 | MIT |
| @esbuild/linux-s390x | 0.27.0 | MIT |
| @esbuild/linux-x64 | 0.27.0 | MIT |
| @esbuild/netbsd-arm64 | 0.27.0 | MIT |
| @esbuild/netbsd-x64 | 0.27.0 | MIT |
| @esbuild/openbsd-arm64 | 0.27.0 | MIT |
| @esbuild/openbsd-x64 | 0.27.0 | MIT |
| @esbuild/openharmony-arm64 | 0.27.0 | MIT |
| @esbuild/sunos-x64 | 0.27.0 | MIT |
| @esbuild/win32-arm64 | 0.27.0 | MIT |
| @esbuild/win32-ia32 | 0.27.0 | MIT |
| @esbuild/win32-x64 | 0.27.0 | MIT |
| @floating-ui/core | 1.7.5 | MIT |
| @floating-ui/dom | 1.7.6 | MIT |
| @floating-ui/utils | 0.2.11 | MIT |
| @lit-labs/ssr-dom-shim | 1.6.0 | BSD-3-Clause |
| @lit/context | 1.1.6 | BSD-3-Clause |
| @lit/reactive-element | 2.1.2 | BSD-3-Clause |
| @lottiefiles/dotlottie-wc | 0.4.6 | MIT |
| @lottiefiles/dotlottie-web | 0.41.0 | MIT |
| @pdf-lib/standard-fonts | 1.0.0 | MIT |
| @pdf-lib/upng | 1.0.1 | MIT |
| @preact/signals-core | 1.14.3 | MIT |
| @sec-ant/readable-stream | 0.4.1 | MIT |
| @shikijs/core | 1.29.2 | MIT |
| @shikijs/engine-javascript | 1.29.2 | MIT |
| @shikijs/engine-oniguruma | 1.29.2 | MIT |
| @shikijs/langs | 1.29.2 | MIT |
| @shikijs/themes | 1.29.2 | MIT |
| @shikijs/types | 1.29.2 | MIT |
| @shikijs/vscode-textmate | 10.0.2 | MIT |
| @toeverything/theme | 1.1.23 | UNKNOWN |
| @tokenizer/token | 0.3.0 | MIT |
| @types/debug | 4.1.13 | MIT |
| @types/flexsearch | 0.7.6 | MIT |
| @types/hast | 3.0.4 | MIT |
| @types/katex | 0.16.8 | MIT |
| @types/lodash | 4.17.24 | MIT |
| @types/lodash.ismatch | 4.4.9 | MIT |
| @types/mdast | 4.0.4 | MIT |
| @types/ms | 2.1.0 | MIT |
| @types/prop-types | 15.7.15 | MIT |
| @types/react | 18.3.31 | MIT |
| @types/trusted-types | 2.0.7 | MIT |
| @types/unist | 3.0.3 | MIT |
| @ungap/structured-clone | 1.3.1 | ISC |
| bail | 2.0.2 | MIT |
| balanced-match | 4.0.4 | MIT |
| base64-arraybuffer | 1.0.2 | MIT |
| brace-expansion | 5.0.6 | MIT |
| ccount | 2.0.1 | MIT |
| character-entities | 2.0.2 | MIT |
| character-entities-html4 | 2.1.0 | MIT |
| character-entities-legacy | 3.0.0 | MIT |
| collapse-white-space | 2.1.0 | MIT |
| comma-separated-tokens | 2.0.3 | MIT |
| commander | 8.3.0 | MIT |
| css-line-break | 2.1.0 | MIT |
| csstype | 3.2.3 | MIT |
| debug | 4.4.3 | MIT |
| decode-named-character-reference | 1.3.0 | MIT |
| dequal | 2.0.3 | MIT |
| devlop | 1.1.0 | MIT |
| dompurify | 3.4.11 | (MPL-2.0 OR Apache-2.0) |
| emoji-regex-xs | 1.0.0 | MIT |
| entities | 6.0.1 | BSD-2-Clause |
| esbuild | 0.27.0 | MIT |
| escape-string-regexp | 5.0.0 | MIT |
| extend | 3.0.2 | MIT |
| fflate | 0.8.3 | MIT |
| file-type | 19.6.0 | MIT |
| flexsearch | 0.7.43 | Apache-2.0 |
| fractional-indexing | 3.3.0 | CC0-1.0 |
| get-stream | 9.0.1 | MIT |
| hast-util-from-html | 2.0.3 | MIT |
| hast-util-from-parse5 | 8.0.3 | MIT |
| hast-util-parse-selector | 4.0.0 | MIT |
| hast-util-to-html | 9.0.5 | MIT |
| hast-util-whitespace | 3.0.0 | MIT |
| hastscript | 9.0.1 | MIT |
| html-void-elements | 3.0.0 | MIT |
| html2canvas | 1.4.1 | MIT |
| idb | 8.0.3 | ISC |
| idb-keyval | 6.2.5 | Apache-2.0 |
| ieee754 | 1.2.1 | BSD-3-Clause |
| is-plain-obj | 4.1.0 | MIT |
| is-stream | 4.0.1 | MIT |
| isomorphic.js | 0.2.5 | MIT |
| katex | 0.16.47 | MIT |
| lib0 | 0.2.117 | MIT |
| lit | 3.3.3 | BSD-3-Clause |
| lit-element | 4.2.2 | BSD-3-Clause |
| lit-html | 3.3.3 | BSD-3-Clause |
| lodash.chunk | 4.2.0 | MIT |
| lodash.clonedeep | 4.5.0 | MIT |
| lodash.ismatch | 4.4.0 | MIT |
| lodash.merge | 4.6.2 | MIT |
| lodash.mergewith | 4.6.2 | MIT |
| longest-streak | 3.1.0 | MIT |
| lz-string | 1.5.0 | MIT |
| markdown-table | 3.0.4 | MIT |
| mdast-util-find-and-replace | 3.0.2 | MIT |
| mdast-util-from-markdown | 2.0.3 | MIT |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT |
| mdast-util-gfm-table | 2.0.0 | MIT |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT |
| mdast-util-math | 3.0.0 | MIT |
| mdast-util-phrasing | 4.1.0 | MIT |
| mdast-util-to-hast | 13.2.1 | MIT |
| mdast-util-to-markdown | 2.1.2 | MIT |
| mdast-util-to-string | 4.0.0 | MIT |
| micromark | 4.0.2 | MIT |
| micromark-core-commonmark | 2.0.3 | MIT |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT |
| micromark-extension-gfm-table | 2.1.1 | MIT |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT |
| micromark-extension-math | 3.1.0 | MIT |
| micromark-factory-destination | 2.0.1 | MIT |
| micromark-factory-label | 2.0.1 | MIT |
| micromark-factory-space | 2.0.1 | MIT |
| micromark-factory-title | 2.0.1 | MIT |
| micromark-factory-whitespace | 2.0.1 | MIT |
| micromark-util-character | 2.1.1 | MIT |
| micromark-util-chunked | 2.0.1 | MIT |
| micromark-util-classify-character | 2.0.1 | MIT |
| micromark-util-combine-extensions | 2.0.1 | MIT |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT |
| micromark-util-decode-string | 2.0.1 | MIT |
| micromark-util-encode | 2.0.1 | MIT |
| micromark-util-html-tag-name | 2.0.1 | MIT |
| micromark-util-normalize-identifier | 2.0.1 | MIT |
| micromark-util-resolve-all | 2.0.1 | MIT |
| micromark-util-sanitize-uri | 2.0.1 | MIT |
| micromark-util-subtokenize | 2.1.0 | MIT |
| micromark-util-symbol | 2.0.1 | MIT |
| micromark-util-types | 2.0.2 | MIT |
| minimatch | 10.2.5 | BlueOak-1.0.0 |
| ms | 2.1.3 | MIT |
| nanoid | 5.1.15 | MIT |
| oniguruma-to-es | 2.3.0 | MIT |
| pako | 1.0.11 | (MIT AND Zlib) |
| parse5 | 7.3.0 | MIT |
| pdf-lib | 1.17.1 | MIT |
| pdf-lib/node_modules/tslib | 1.14.1 | 0BSD |
| peek-readable | 5.4.2 | MIT |
| property-information | 7.2.0 | MIT |
| regex | 5.1.1 | MIT |
| regex-recursion | 5.1.1 | MIT |
| regex-utilities | 2.3.0 | MIT |
| rehype-parse | 9.0.1 | MIT |
| rehype-stringify | 10.0.1 | MIT |
| remark-math | 6.0.0 | MIT |
| remark-parse | 11.0.0 | MIT |
| remark-stringify | 11.0.0 | MIT |
| shiki | 1.29.2 | MIT |
| simple-xml-to-json | 1.2.7 | MIT |
| space-separated-tokens | 2.0.2 | MIT |
| stringify-entities | 4.0.4 | MIT |
| strtok3 | 9.1.1 | MIT |
| text-segmentation | 1.0.3 | MIT |
| token-types | 6.1.2 | MIT |
| trim-lines | 3.0.1 | MIT |
| trough | 2.2.0 | MIT |
| uint8array-extras | 1.5.0 | MIT |
| unified | 11.0.5 | MIT |
| unist-util-is | 6.0.1 | MIT |
| unist-util-position | 5.0.0 | MIT |
| unist-util-remove-position | 5.0.0 | MIT |
| unist-util-stringify-position | 4.0.0 | MIT |
| unist-util-visit | 5.1.0 | MIT |
| unist-util-visit-parents | 6.0.2 | MIT |
| utrie | 1.0.2 | MIT |
| vfile | 6.0.3 | MIT |
| vfile-location | 5.0.3 | MIT |
| vfile-message | 4.0.3 | MIT |
| w3c-keyname | 2.2.8 | MIT |
| web-namespaces | 2.0.1 | MIT |
| y-protocols | 1.0.7 | MIT |
| yjs | 13.6.31 | MIT |
| zod | 3.25.76 | MIT |
| zwitch | 2.0.4 | MIT |
