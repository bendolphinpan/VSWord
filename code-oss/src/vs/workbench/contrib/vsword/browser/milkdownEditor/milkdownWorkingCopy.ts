/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRevertOptions, ISaveOptions, SaveReason } from '../../../../common/editor.js';
import {
	IWorkingCopy,
	IWorkingCopyBackup,
	IWorkingCopySaveEvent,
	WorkingCopyCapabilities,
} from '../../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import {
	VSWORD_MILKDOWN_AUTOSAVE_DEBOUNCE_MS,
	VSWORD_MILKDOWN_WORKING_COPY_TYPE_ID,
} from './milkdownEditorProtocol.js';

/**
 * A single Markdown document backed by disk, whose in-memory content is edited
 * from a Milkdown webview. Implements {@link IWorkingCopy} so the workbench:
 *
 *  - shows a native dirty indicator on the tab,
 *  - runs its close-confirmation dialog,
 *  - provides hot-exit backups,
 *  - honors `Files: Auto Save` (via {@link onDidChangeContent}), and
 *  - lets `File: Revert File` roll us back.
 *
 * External file changes (`onDidFilesChange`) are surfaced through
 * {@link onExternalChange}; the host contribution decides whether to silently
 * reload or prompt the user, since only it knows the current UI dirty state.
 */
export interface IMilkdownExternalChangeEvent {
	readonly changeType: FileChangeType;
}

export interface IMilkdownWorkingCopyLoadResult {
	readonly markdown: string;
	readonly reason: 'initial' | 'externalChange' | 'revert';
}

export class MilkdownWorkingCopy extends Disposable implements IWorkingCopy {

	readonly typeId = VSWORD_MILKDOWN_WORKING_COPY_TYPE_ID;
	readonly capabilities = WorkingCopyCapabilities.None;

	get name(): string { return basename(this.resource); }

	//#region Events (IWorkingCopy)

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	//#endregion

	//#region Events (Milkdown-specific)

	private readonly _onExternalChange = this._register(new Emitter<IMilkdownExternalChangeEvent>());
	readonly onExternalChange = this._onExternalChange.event;

	private readonly _onDidReload = this._register(new Emitter<IMilkdownWorkingCopyLoadResult>());
	/** Fires whenever we push new authoritative content into the editor. */
	readonly onDidReload: Event<IMilkdownWorkingCopyLoadResult> = this._onDidReload.event;

	//#endregion

	private _current = '';
	private _saved = '';
	private _dirty = false;
	private _saving = false;
	private _loaded = false;

	/** Autosave debounce timer id (any because Node vs. DOM types differ). */
	private _autoSaveTimer: any = undefined;

	private readonly _fileWatcher = this._register(new DisposableStore());

	constructor(
		readonly resource: URI,
		@IFileService private readonly fileService: IFileService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(workingCopyService.registerWorkingCopy(this));

		// Watch the on-disk file so we can react to external edits.
		this._fileWatcher.add(this.fileService.watch(this.resource));
		this._fileWatcher.add(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
	}

	//#region IWorkingCopy — dirty tracking

	isDirty(): boolean { return this._dirty; }
	isModified(): boolean { return this._dirty; }

	//#endregion

	//#region Content access

	/** Current in-memory Markdown, as last reported by the webview. */
	getContent(): string { return this._current; }

	/** Whether {@link load} has been called at least once. */
	get isLoaded(): boolean { return this._loaded; }

	/**
	 * Called by the host when the webview reports new content
	 * (`markdownUpdated`). Fires {@link onDidChangeContent} so the workbench
	 * schedules a backup, and schedules our autosave debounce.
	 */
	updateContent(markdown: string): void {
		if (markdown === this._current) {
			return;
		}
		this._current = markdown;
		const nowDirty = markdown !== this._saved;
		const dirtyChanged = nowDirty !== this._dirty;
		this._dirty = nowDirty;

		this._onDidChangeContent.fire();
		if (dirtyChanged) {
			this._onDidChangeDirty.fire();
		}
		this.scheduleAutoSave();
	}

	/** Read the on-disk content and mark this copy as clean at that snapshot. */
	async load(reason: IMilkdownWorkingCopyLoadResult['reason'] = 'initial'): Promise<string> {
		const stat = await this.fileService.readFile(this.resource);
		const markdown = stat.value.toString();
		this._current = markdown;
		this._saved = markdown;
		this._loaded = true;
		if (this._dirty) {
			this._dirty = false;
			this._onDidChangeDirty.fire();
		}
		this._onDidReload.fire({ markdown, reason });
		return markdown;
	}

	//#endregion

	//#region IWorkingCopy — save / revert / backup

	async save(options?: ISaveOptions): Promise<boolean> {
		this.cancelAutoSave();
		if (!this._dirty && this._loaded && !options?.force) {
			return true; // nothing to do — matches text-file behavior
		}
		if (this._saving) {
			return true; // already in flight; callers may retry after
		}
		this._saving = true;
		const snapshot = this._current;
		try {
			await this.fileService.writeFile(this.resource, VSBuffer.fromString(snapshot));
			this._saved = snapshot;
			if (this._dirty) {
				this._dirty = false;
				this._onDidChangeDirty.fire();
			}
			this._onDidSave.fire({ reason: options?.reason, source: options?.source });
			return true;
		} catch (err) {
			this.logService.error('[VSWord Milkdown] save failed:', err);
			return false;
		} finally {
			this._saving = false;
		}
	}

	async revert(_options?: IRevertOptions): Promise<void> {
		this.cancelAutoSave();
		try {
			await this.load('revert');
		} catch (err) {
			this.logService.error('[VSWord Milkdown] revert failed:', err);
			throw err;
		}
	}

	async backup(_token: CancellationToken): Promise<IWorkingCopyBackup> {
		return {
			content: bufferToStream(VSBuffer.fromString(this._current)),
		};
	}

	//#endregion

	//#region Autosave

	private scheduleAutoSave(): void {
		this.cancelAutoSave();
		if (!this._dirty) {
			return;
		}
		this._autoSaveTimer = setTimeout(() => {
			this._autoSaveTimer = undefined;
			void this.save({ reason: SaveReason.AUTO });
		}, VSWORD_MILKDOWN_AUTOSAVE_DEBOUNCE_MS);
	}

	private cancelAutoSave(): void {
		if (this._autoSaveTimer !== undefined) {
			clearTimeout(this._autoSaveTimer);
			this._autoSaveTimer = undefined;
		}
	}

	//#endregion

	//#region External change

	private onDidFilesChange(event: FileChangesEvent): void {
		if (this._saving) {
			return; // our own write is echoing back
		}
		if (!event.contains(this.resource)) {
			return;
		}
		let changeType: FileChangeType = FileChangeType.UPDATED;
		if (event.contains(this.resource, FileChangeType.DELETED)) {
			changeType = FileChangeType.DELETED;
		} else if (event.contains(this.resource, FileChangeType.ADDED)) {
			changeType = FileChangeType.ADDED;
		}
		this._onExternalChange.fire({ changeType });
	}

	//#endregion

	override dispose(): void {
		this.cancelAutoSave();
		super.dispose();
	}
}
