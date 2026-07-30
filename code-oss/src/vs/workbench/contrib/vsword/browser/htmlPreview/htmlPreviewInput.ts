/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import {
	EditorInputCapabilities,
	IUntypedEditorInput,
	Verbosity,
} from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import {
	VSWORD_HTML_PREVIEW_EDITOR_ID,
	VSWORD_HTML_PREVIEW_TYPE_ID,
} from './htmlPreviewProtocol.js';

/**
 * 只读 HTML 预览页签。resource 指向磁盘/工作区 URI，便于 Explorer / breadcrumbs。
 * 不参与 dirty 写回；源码编辑始终在默认 Text Editor。
 */
export class HtmlPreviewInput extends WebviewInput {

	public static readonly TYPE_ID = VSWORD_HTML_PREVIEW_TYPE_ID;

	public override get typeId(): string {
		return HtmlPreviewInput.TYPE_ID;
	}

	public override get editorId(): string {
		return VSWORD_HTML_PREVIEW_EDITOR_ID;
	}

	private readonly _fileResource: URI;
	public override get resource(): URI {
		return this._fileResource;
	}

	private _shortDescription?: string;
	private _mediumDescription?: string;
	private _longDescription?: string;

	constructor(
		resource: URI,
		webview: IOverlayWebview,
		@IThemeService themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super(
			{
				viewType: VSWORD_HTML_PREVIEW_EDITOR_ID,
				providedId: VSWORD_HTML_PREVIEW_EDITOR_ID,
				name: basename(resource),
				iconPath: undefined,
			},
			webview,
			themeService,
		);
		this._fileResource = resource;
	}

	public override get capabilities(): EditorInputCapabilities {
		// 只读预览；允许分屏打开同一文件的源码 + 预览（不设 Singleton）
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.CanDropIntoEditor;
	}

	public override getName(): string {
		return basename(this._fileResource);
	}

	public override getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string | undefined {
		switch (verbosity) {
			case Verbosity.SHORT:
				this._shortDescription ??= this.labelService.getUriBasenameLabel(dirname(this._fileResource));
				return this._shortDescription;
			case Verbosity.LONG:
				this._longDescription ??= this.labelService.getUriLabel(dirname(this._fileResource));
				return this._longDescription;
			case Verbosity.MEDIUM:
			default:
				this._mediumDescription ??= this.labelService.getUriLabel(dirname(this._fileResource), { relative: true });
				return this._mediumDescription;
		}
	}

	public override getTitle(verbosity?: Verbosity): string {
		const label = this.labelService.getUriLabel(this._fileResource, { relative: verbosity !== Verbosity.LONG });
		return `${label} (预览)`;
	}

	public override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (otherInput === this) {
			return true;
		}
		if (otherInput instanceof HtmlPreviewInput) {
			return isEqual(this._fileResource, otherInput._fileResource);
		}
		return super.matches(otherInput);
	}

	public override toUntyped(): IUntypedEditorInput {
		return {
			resource: this._fileResource,
			options: {
				override: VSWORD_HTML_PREVIEW_EDITOR_ID,
				pinned: true,
			},
		};
	}
}
