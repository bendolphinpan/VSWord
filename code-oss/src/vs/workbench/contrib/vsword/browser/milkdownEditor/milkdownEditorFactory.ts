/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { GroupIdentifier } from '../../../../common/editor.js';
import { IWebviewService, IOverlayWebview } from '../../../webview/browser/webview.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import {
	VSWORD_MILKDOWN_EDITOR_ID,
	VSWORD_MILKDOWN_ORIGIN,
} from './milkdownEditorProtocol.js';

export interface MilkdownWebviewResources {
	readonly vendorRoot: URI;
	readonly scriptUri: URI;
	readonly katexCssUri: URI;
}

/**
 * 创建后的 MilkdownEditorInput 需要 host contribution `attach` 才能：
 *   setHtml / message pump / workingCopy 事件桥接 / postInit。
 * 工厂与 Serializer 共用此 hook，避免「恢复出页签但 webview 空白」。
 */
type AttachHandler = (input: MilkdownEditorInput) => void;

let attachHandler: AttachHandler | undefined;

/** Contribution 构造时注册；dispose 时清空。 */
export function setMilkdownEditorAttachHandler(handler: AttachHandler | undefined): void {
	attachHandler = handler;
}

export function getMilkdownWebviewResources(): MilkdownWebviewResources {
	const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/milkdownEditor/vendor');
	return {
		vendorRoot,
		scriptUri: URI.joinPath(vendorRoot, 'index.js'),
		katexCssUri: URI.joinPath(vendorRoot, 'katex', 'katex.min.css'),
	};
}

export function createMilkdownWebviewOverlay(
	webviewService: IWebviewService,
	resource: URI,
): IOverlayWebview {
	const { vendorRoot } = getMilkdownWebviewResources();
	return webviewService.createWebviewOverlay({
		providedViewType: VSWORD_MILKDOWN_EDITOR_ID,
		extension: undefined,
		origin: VSWORD_MILKDOWN_ORIGIN,
		title: basename(resource),
		options: { enableFindWidget: true, retainContextWhenHidden: true },
		contentOptions: {
			allowScripts: true,
			// T-3.5.1: parent dir so relative images under assets/ load via webview URI.
			localResourceRoots: [vendorRoot, dirname(resource)],
		},
	});
}

/**
 * 创建 file-backed Milkdown 输入并通知 contribution attach。
 * Resolver `createEditorInput` 与 `IEditorSerializer.deserialize` 共用此路径。
 */
export function createMilkdownEditorInput(
	instantiationService: IInstantiationService,
	webviewService: IWebviewService,
	resource: URI,
	groupId?: GroupIdentifier,
): MilkdownEditorInput {
	const webview = createMilkdownWebviewOverlay(webviewService, resource);
	const input = instantiationService.createInstance(MilkdownEditorInput, resource, webview);
	if (typeof groupId === 'number') {
		input.updateGroup(groupId);
	}
	// attach 必须同步发生：否则 restored pane 先 claim webview 时还没有 HTML。
	try {
		attachHandler?.(input);
	} catch {
		// contribution 未就绪时由 contribution 二次 ensureAttach 兜底
	}
	return input;
}
