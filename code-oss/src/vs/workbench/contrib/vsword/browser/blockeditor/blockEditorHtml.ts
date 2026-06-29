/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { asWebviewUri, webviewGenericCspSource } from '../../../webview/common/webview.js';

export function getBlockEditorHtml(scriptUri: URI, styleUri: URI): string {
	const scriptSrc = asWebviewUri(scriptUri).toString(true);
	const styleSrc = asWebviewUri(styleUri).toString(true);
	const cspSource = webviewGenericCspSource;
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource}; connect-src ${cspSource} blob: data:; worker-src ${cspSource} blob:;">
<title>VSWord Block Editor</title>
<style>
html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
body {
	font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
	background: var(--vscode-editor-background, #ffffff);
	color: var(--vscode-editor-foreground, #1f2328);
}
#app { overflow-y: auto; }
.bn-container { --bn-colors-editor-background: var(--vscode-editor-background, #ffffff); }
.bn-editor { max-width: 800px; margin: 0 auto; padding: 24px 32px; }
</style>
<link rel="stylesheet" href="${styleSrc}">
</head>
<body>
	<div id="app">
		<div style="padding: 24px; color: var(--vscode-descriptionForeground, #888);">Loading Block Editor…</div>
	</div>
	<script type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}
