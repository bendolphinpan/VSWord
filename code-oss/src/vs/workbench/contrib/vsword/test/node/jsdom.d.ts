/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ambient shim for the T-3.7 mocha runner. The real 'jsdom' package is
// injected at runtime by the runner's esbuild alias plugin (see
// hermes-runner build output); no compile-time types are required.

declare module 'jsdom' {
	export class JSDOM {
		constructor(html?: string, options?: any);
		readonly window: any;
	}
}
