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
	WebviewSessionReadyMessage,
} from './milkdownEditorProtocol.js';
import {
	createRoundtripSession,
	IRoundtripSession,
	SrcRange,
} from './roundtrip/roundtripSession.js';
import { assembleIncremental, pickSavePath, SavePath } from './roundtrip/roundtripSerializer.js';

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
 *
 * T-3.8.2: 三分支保存策略
 *   分支 A · byte-for-byte —— dirty 集合为空、_openedBytes 齐备时，把原始磁盘字节原样回写
 *   分支 B · 增量 remark  —— session isSafe + dirty 已知 + contents 齐时，拼装原文 + dirty 片段
 *   分支 C · 全文 remark  —— 兜底 / format 命令强制 / session 缺失或不安全
 * 决策由 {@link pickSavePath} 完成，实际拼装由 {@link assembleIncremental} 完成，
 * 二者均为纯函数模块，可裸跑单测。
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

	// ---- T-3.8.2 round-trip 状态 -----------------------------------------
	/** load() 落地的磁盘原始字节（含 BOM）。A 分支复用；B/C 保存后刷新。 */
	private _openedBytes: Uint8Array | null = null;
	/** webview sessionReady 后落地的不可变 session 快照；load/revert/externalChange 时清空。 */
	private _session: IRoundtripSession | null = null;
	/**
	 * webview 侧 tracker plugin 报告的 dirty blockId。null = 整篇 dirty（尚未挂 tracker 或
	 * session outdated），[] = 完全无 dirty（byte-for-byte 分支可选）。
	 */
	private _dirtyBlockIds: readonly string[] | null = null;
	/** dirty blockId → 最新 markdown 片段。null / 缺项 → pickSavePath 会降级到 C。 */
	private _dirtyBlockContents: Readonly<Record<string, string>> | null = null;
	/**
	 * format 命令预设的 forcePath；save() 消费一次后自动清空。
	 *   'C' = FormatDocumentAction 强制全文 remark；
	 *   'B' = FormatSelectionAction 强制走增量（选区 block 集合 forceDirty 后）；
	 */
	private _pendingForcePath: SavePath | null = null;

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

	// ---- T-3.8.2 内部状态读取（单测友好，非 public API 承诺） ----
	/** @internal 供单测断言用。 */
	get _testOpenedBytes(): Uint8Array | null { return this._openedBytes; }
	/** @internal 供单测断言用。 */
	get _testSession(): IRoundtripSession | null { return this._session; }
	/** @internal 供单测断言用。 */
	get _testPendingForcePath(): SavePath | null { return this._pendingForcePath; }

	/**
	 * Called by the host when the webview reports new content
	 * (`markdownUpdated`). Fires {@link onDidChangeContent} so the workbench
	 * schedules a backup, and schedules our autosave debounce.
	 *
	 * T-3.8.2: 签名扩展 —— 允许 webview 顺带传入 dirty 集合与对应 markdown 片段，
	 * 供后续 save() 走 B 分支拼装使用。若 webview 未提供（旧路径），保持整篇 dirty 语义
	 * —— dirtyBlockIds=null → pickSavePath 直接走 C。
	 */
	updateContent(
		markdown: string,
		dirtyBlockIds?: readonly string[] | null,
		dirtyBlockContents?: Readonly<Record<string, string>> | null,
	): void {
		if (markdown === this._current
			&& dirtyBlockIds === undefined
			&& dirtyBlockContents === undefined) {
			return;
		}
		this._current = markdown;
		// dirty 集合快照 —— undefined = webview 没带（沿用旧路径，整篇 dirty），
		// null = webview 明确告知整篇 dirty（例如 sessionReady 前）。
		if (dirtyBlockIds !== undefined) {
			this._dirtyBlockIds = dirtyBlockIds ? [...dirtyBlockIds] : dirtyBlockIds;
		}
		if (dirtyBlockContents !== undefined) {
			this._dirtyBlockContents = dirtyBlockContents ? { ...dirtyBlockContents } : dirtyBlockContents;
		}
		const nowDirty = markdown !== this._saved;
		const dirtyChanged = nowDirty !== this._dirty;
		this._dirty = nowDirty;

		this._onDidChangeContent.fire();
		if (dirtyChanged) {
			this._onDidChangeDirty.fire();
		}
		this.scheduleAutoSave();
	}

	/**
	 * T-3.8.2: 接收 webview 首次 parse 完成后送来的 sessionReady 消息，落地 session 快照。
	 * 后续 save() 决策会读取 _session 判定是否走 B 分支。
	 * 若消息比当前更旧（epoch 落后），忽略（防乱序覆盖）。
	 */
	updateSession(payload: WebviewSessionReadyMessage): void {
		if (this._session && payload.epoch < this._session.epoch) {
			return;
		}
		try {
			const blockRanges = new Map<string, SrcRange>();
			for (const [id, r] of Object.entries(payload.blockRanges)) {
				blockRanges.set(id, [r[0], r[1]] as SrcRange);
			}
			// sourceText 用 _saved —— 它是 load 时返回给 webview 的原 markdown，
			// 与 webview 侧 parse 用的 sourceText 严格同源。不重新解码 _openedBytes，
			// 避免 TextDecoder 与 VSBuffer.toString 语义偏差。
			this._session = createRoundtripSession({
				epoch: payload.epoch,
				sourceText: this._saved,
				blockOrder: [...payload.blockOrder],
				blockRanges,
				interstitial: payload.interstitial.map(r => [r[0], r[1]] as SrcRange),
			});
			// 每次新 session 落地，把上一轮的 dirty 状态清空 —— webview 下一次 markdownUpdated
			// 会带来对应 session 的 dirty 集合。
			this._dirtyBlockIds = null;
			this._dirtyBlockContents = null;
		} catch (err) {
			this.logService.error('[VSWord Milkdown] updateSession failed:', err);
			this._session = null;
		}
	}

	/** Read the on-disk content and mark this copy as clean at that snapshot. */
	async load(reason: IMilkdownWorkingCopyLoadResult['reason'] = 'initial'): Promise<string> {
		const stat = await this.fileService.readFile(this.resource);
		// _openedBytes 拷贝一份，切断底层 VSBuffer 的 ArrayBuffer 别名，
		// 防止后续 IFileService 内部复用同一 buffer 造成状态污染。
		const raw = stat.value.buffer;
		const bytes = new Uint8Array(raw.byteLength);
		bytes.set(raw);
		this._openedBytes = bytes;
		const markdown = stat.value.toString();
		this._current = markdown;
		this._saved = markdown;
		this._loaded = true;
		// session 与 dirty 状态与磁盘快照严格绑定 —— reload 后一律重置。
		this._session = null;
		this._dirtyBlockIds = null;
		this._dirtyBlockContents = null;
		this._pendingForcePath = null;
		if (this._dirty) {
			this._dirty = false;
			this._onDidChangeDirty.fire();
		}
		this._onDidReload.fire({ markdown, reason });
		return markdown;
	}

	//#endregion

	//#region T-3.8.2 · Format commands

	/**
	 * T-3.8.2 · Qa2=c 「格式化整篇」/「格式化选区」的 host 侧钩子。
	 * 命令 handler 调用本方法 → 内部记录 forcePath → 后续 save() 消费一次。
	 * 实际的 webview 序列化由 contribution 层再 post 一条 formatDocument / formatSelection 消息。
	 *
	 *   scope='document' → forcePath='C'（走全文 remark，最强保证幂等）。
	 *   scope='selection' → forcePath='B'（webview 已把选区块加入 dirty，走增量拼装）。
	 *
	 * forcePath 是一次性标记 —— save() 里 pickSavePath 消费后自动清空。
	 */
	setPendingFormatPath(scope: 'document' | 'selection'): void {
		this._pendingForcePath = scope === 'document' ? 'C' : 'B';
	}

	//#endregion

	//#region IWorkingCopy — save / revert / backup

	async save(options?: ISaveOptions): Promise<boolean> {
		this.cancelAutoSave();
		if (!this._dirty && this._loaded && !options?.force && !this._pendingForcePath) {
			return true; // nothing to do — matches text-file behavior
		}
		if (this._saving) {
			return true; // already in flight; callers may retry after
		}
		this._saving = true;
		const snapshot = this._current;
		const forcePath = this._pendingForcePath;
		// forcePath 是一次性 —— 无论 save 是否成功都消耗掉，避免下一次 typing 意外走 C。
		this._pendingForcePath = null;

		const chosen = pickSavePath({
			session: this._session,
			dirtyBlockIds: this._dirtyBlockIds,
			dirtyBlockContents: this._dirtyBlockContents,
			openedBytes: this._openedBytes,
			forcePath: forcePath ?? undefined,
		});

		try {
			let bytesWritten: Uint8Array;
			if (chosen === 'A') {
				// byte-for-byte 回写；_openedBytes 一定非空（pickSavePath 已保证）。
				bytesWritten = this._openedBytes!;
				await this.fileService.writeFile(this.resource, VSBuffer.wrap(bytesWritten));
			} else if (chosen === 'B') {
				// 增量拼装；session 与 dirtyBlockContents 都齐备（pickSavePath 已保证）。
				try {
					bytesWritten = assembleIncremental(this._session!, this._dirtyBlockContents!);
					await this.fileService.writeFile(this.resource, VSBuffer.wrap(bytesWritten));
				} catch (err) {
					// 拼装失败 → 降级到 C（decisions §"降级"）。
					this.logService.warn('[VSWord Milkdown] incremental assemble failed, falling back to C:', err);
					bytesWritten = new TextEncoder().encode(snapshot);
					await this.fileService.writeFile(this.resource, VSBuffer.fromString(snapshot));
				}
			} else {
				// C · 全文 remark：直接把 webview 序列化出来的当前 markdown 写盘。
				bytesWritten = new TextEncoder().encode(snapshot);
				await this.fileService.writeFile(this.resource, VSBuffer.fromString(snapshot));
			}

			// 保存成功后同步内部状态：
			//   - _saved 追到 snapshot（B/C 分支）或磁盘上原始文本（A 分支）；
			//   - A 分支 _openedBytes 原样保留；B/C 分支刷新为新写入的 bytes；
			//   - dirtyBlocks 清空（tracker 侧会在下一轮 markdownUpdated 重发）；
			//   - session 保留（sourceText 已过期，需要下一次 sessionReady 刷新，但保留期间
			//     pickSavePath 会因为 dirty 判定重新走 C 直到新 session 落地 —— 这条不变式
			//     在 pickSavePath 的 8 分支里由 forcePath / dirty 覆盖）。
			this._saved = snapshot;
			if (chosen !== 'A') {
				const nb = new Uint8Array(bytesWritten.length);
				nb.set(bytesWritten);
				this._openedBytes = nb;
				// B/C 后 session 里的 sourceText 已过期。清掉，等 webview 下一次 sessionReady 重放。
				this._session = null;
			}
			this._dirtyBlockIds = null;
			this._dirtyBlockContents = null;

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
		// PRD §5 契约：backup 只反映当前 UI 状态，永远走 _current，
		// 不参与三分支决策（否则可能把过期 openedBytes 备份成新版本）。
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
		// 释放大字节缓存，避免 dispose 后仍持有磁盘副本。
		this._openedBytes = null;
		this._session = null;
		this._dirtyBlockIds = null;
		this._dirtyBlockContents = null;
		super.dispose();
	}
}
