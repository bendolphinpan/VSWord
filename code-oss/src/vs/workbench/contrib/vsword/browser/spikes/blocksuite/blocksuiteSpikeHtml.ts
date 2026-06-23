/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { asWebviewUri, webviewGenericCspSource } from '../../../../webview/common/webview.js';

export function getBlockSuiteSpikeHtml(scriptUri: URI, styleUri: URI): string {
	const scriptSrc = asWebviewUri(scriptUri).toString(true);
	const styleSrc = asWebviewUri(styleUri).toString(true);
	const cspSource = webviewGenericCspSource;
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource}; connect-src ${cspSource} blob: data:; worker-src ${cspSource} blob:;">
<title>VSWord BlockSuite Spike</title>
<link rel="stylesheet" href="${styleSrc}">
</head>
<body>
	<div id="app">
		<div class="spike-loading">
			<div class="spinner"></div>
			<div>
				<h1>Loading BlockSuite Edgeless Spike…</h1>
				<p>Dev-only experiment. Current SVG canvas is untouched.</p>
			</div>
		</div>
	</div>
	<script type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}
