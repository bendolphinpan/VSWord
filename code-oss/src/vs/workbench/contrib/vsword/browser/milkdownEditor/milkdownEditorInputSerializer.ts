/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * 会话恢复：把 Milkdown 页签序列化进 workbench 状态，启动后反序列化重建。
 *
 * 背景：MilkdownEditorInput 覆写了 typeId（≠ WebviewInput.typeId），
 * 不会走 WebviewEditorInputSerializer。若未注册本 serializer，
 * 关闭 VSWord 再开时 .md 页签会被静默丢弃（用户反馈「无法保证 md 页签继续显示」）。
 */

import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { createMilkdownEditorInput } from './milkdownEditorFactory.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';

interface ISerializedMilkdownEditorInput {
	readonly resourceJSON: UriComponents;
}

export class MilkdownEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof MilkdownEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!(editorInput instanceof MilkdownEditorInput)) {
			return undefined;
		}
		try {
			const data: ISerializedMilkdownEditorInput = {
				resourceJSON: editorInput.resource.toJSON(),
			};
			return JSON.stringify(data);
		} catch {
			return undefined;
		}
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		try {
			const data = JSON.parse(serializedEditorInput) as ISerializedMilkdownEditorInput;
			const resource = URI.revive(data.resourceJSON);
			if (!resource) {
				return undefined;
			}
			return instantiationService.invokeFunction(accessor => {
				const webviewService = accessor.get(IWebviewService);
				return createMilkdownEditorInput(instantiationService, webviewService, resource);
			});
		} catch {
			return undefined;
		}
	}
}
