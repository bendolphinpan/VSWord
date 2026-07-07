/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.1.a · ambient shims for the toc-remark ad-hoc test runner.
//
// unified / remark-parse / remark-stringify 都是 test-only 依赖，装在
// `.tmp/milkdown-prod-builder/node_modules/` 下，由 run-toc-remark-test.mjs 的
// esbuild alias / nodePaths 在运行时注入。VSCode 主项目的 tsc typecheck 里
// 没有对应 npm 包也没有 @types，这里给三个模块补最小可用的 ambient 声明，
// 只让 typecheck 通过——运行时行为完全由 builder node_modules 提供。
//
// 与 jsdom.d.ts 同一套路。

declare module 'unified' {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export function unified(): any;
}

declare module 'remark-parse' {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const remarkParse: any;
	export default remarkParse;
}

declare module 'remark-stringify' {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const remarkStringify: any;
	export default remarkStringify;
}
