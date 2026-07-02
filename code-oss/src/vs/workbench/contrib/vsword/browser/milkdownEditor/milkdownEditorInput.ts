/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import {
	EditorInputCapabilities,
	GroupIdentifier,
	IRevertOptions,
	ISaveOptions,
	IUntypedEditorInput,
	Verbosity,
} from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import {
	VSWORD_MILKDOWN_EDITOR_ID,
} from './milkdownEditorProtocol.js';
import { MilkdownWorkingCopy } from './milkdownWorkingCopy.js';

/**
 * Editor input for the Milkdown WYSIWYG editor.
 *
 * Extends {@link WebviewInput} to inherit its lifecycle (webview
 * claim/release, drop handling, `WebviewEditor` pane binding via the
 * `[new SyncDescriptor(WebviewInput)]` pane registration) but overrides
 * `resource`, `capabilities`, `matches` and the save/revert delegates so the
 * tab behaves like a real file-backed editor:
 *
 *  - `resource` is the on-disk `.md` URI → shows in Explorer, Recent, breadcrumbs
 *  - `capabilities` drops `Readonly` and `Singleton` so the dirty dot shows and
 *    the same file can open in split groups
 *  - `matches` uses the file URI + editorId so re-opening the same document
 *    returns the existing input (VSCode standard editor identity)
 *  - `isDirty`/`save`/`revert` delegate to a {@link MilkdownWorkingCopy}
 */
export class MilkdownEditorInput extends WebviewInput {

	public static readonly TYPE_ID = 'workbench.editors.vsword.milkdown';

	public override get typeId(): string { return MilkdownEditorInput.TYPE_ID; }
	public override get editorId(): string { return VSWORD_MILKDOWN_EDITOR_ID; }

	private readonly _fileResource: URI;
	public override get resource(): URI { return this._fileResource; }

	public readonly workingCopy: MilkdownWorkingCopy;

	private _shortDescription?: string;
	private _mediumDescription?: string;
	private _longDescription?: string;

	private readonly _localDisposables = this._register(new DisposableStore());

	private readonly _onDidRequestReload = this._register(new Emitter<void>());
	/** Fires when the pane should force the webview to reload document content. */
	readonly onDidRequestReload = this._onDidRequestReload.event;

	constructor(
		resource: URI,
		webview: IOverlayWebview,
		@IThemeService themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			{
				viewType: VSWORD_MILKDOWN_EDITOR_ID,
				providedId: VSWORD_MILKDOWN_EDITOR_ID,
				name: basename(resource),
				iconPath: undefined,
			},
			webview,
			themeService,
		);
		this._fileResource = resource;
		this.workingCopy = this._register(instantiationService.createInstance(MilkdownWorkingCopy, resource));

		// Working-copy dirty state must fan-out to the editor tab.
		this._localDisposables.add(this.workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
	}

	public override get capabilities(): EditorInputCapabilities {
		// Intentional divergence from WebviewInput:
		//   - drop Readonly (we save via WorkingCopy)
		//   - drop Singleton (opening the same file in a split is fine)
		//   - keep CanDropIntoEditor (drag-and-drop like a normal editor)
		return EditorInputCapabilities.CanDropIntoEditor;
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
		return this.labelService.getUriLabel(this._fileResource, { relative: verbosity !== Verbosity.LONG });
	}

	public override isDirty(): boolean {
		return this.workingCopy.isDirty();
	}

	public override async save(_group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const ok = await this.workingCopy.save(options);
		return ok ? this : undefined;
	}

	public override async revert(_group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this.workingCopy.revert(options);
		this._onDidRequestReload.fire();
	}

	public override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (otherInput === this) {
			return true;
		}
		if (otherInput instanceof MilkdownEditorInput) {
			return isEqual(this._fileResource, otherInput._fileResource);
		}
		// Fall through to base implementation which compares resource + editorId
		// (from `options.override`) for untyped resource editor inputs.
		return super.matches(otherInput);
	}
}
