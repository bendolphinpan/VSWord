/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { FileChangesEvent, FileChangeType } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MilkdownWorkingCopy } from '../../browser/milkdownEditor/milkdownWorkingCopy.js';
import { SaveReason } from '../../../../common/editor.js';

/**
 * Minimal fake IFileService — only implements the surface MilkdownWorkingCopy
 * actually calls (readFile / writeFile / watch / onDidFilesChange). Everything
 * else is a `throw` to fail loudly if the class starts using new APIs.
 */
function createFakeFileService(initial: Record<string, string>) {
	const files = new Map<string, string>(Object.entries(initial));
	const changeEmitter = new Emitter<FileChangesEvent>();
	const writeCalls: Array<{ resource: string; contents: string }> = [];

	const service: any = {
		onDidFilesChange: changeEmitter.event,
		async readFile(resource: URI) {
			const key = resource.toString();
			const value = files.get(key);
			if (value === undefined) {
				throw new Error('ENOENT ' + key);
			}
			return { value: VSBuffer.fromString(value), resource, name: '', size: value.length, etag: '', mtime: 0, ctime: 0, readonly: false, locked: false };
		},
		async writeFile(resource: URI, buffer: VSBuffer) {
			const contents = buffer.toString();
			files.set(resource.toString(), contents);
			writeCalls.push({ resource: resource.toString(), contents });
			return { resource, name: '', size: contents.length, etag: '', mtime: Date.now(), ctime: 0, readonly: false, locked: false };
		},
		watch(_resource: URI) { return { dispose: () => { /* noop */ } }; },
	};

	function emitChange(resource: URI, type: FileChangeType = FileChangeType.UPDATED): void {
		changeEmitter.fire(new FileChangesEvent([{ resource, type }], false));
	}

	return { service, files, writeCalls, emitChange, disposeEmitter: () => changeEmitter.dispose() };
}

/**
 * Minimal fake IWorkingCopyService — only implements `registerWorkingCopy`.
 * We don't validate registry behavior; that's covered by the real service's
 * own tests. We only care that our WorkingCopy stashes the disposable.
 */
function createFakeWorkingCopyService() {
	const registered: any[] = [];
	const service: any = {
		registerWorkingCopy(copy: any) {
			registered.push(copy);
			return { dispose: () => { /* noop */ } };
		},
	};
	return { service, registered };
}

/**
 * Wait one microtask so any queued events fire before we assert on state.
 */
function flush(): Promise<void> {
	return new Promise(resolve => Promise.resolve().then(() => resolve()));
}

suite('VSWord Milkdown WorkingCopy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function make(initialContent = '# hello\n'): {
		copy: MilkdownWorkingCopy;
		resource: URI;
		fs: ReturnType<typeof createFakeFileService>;
		wcs: ReturnType<typeof createFakeWorkingCopyService>;
		disposables: DisposableStore;
	} {
		const resource = URI.file('/virtual/doc.md');
		const fs = createFakeFileService({ [resource.toString()]: initialContent });
		const wcs = createFakeWorkingCopyService();
		const copy = new MilkdownWorkingCopy(resource, fs.service, wcs.service, new NullLogService());
		const disposables = new DisposableStore();
		disposables.add(copy);
		disposables.add({ dispose: fs.disposeEmitter });
		return { copy, resource, fs, wcs, disposables };
	}

	test('initial load populates content and stays clean', async () => {
		const { copy, disposables } = make('# initial\n');
		const markdown = await copy.load('initial');
		assert.strictEqual(markdown, '# initial\n');
		assert.strictEqual(copy.getContent(), '# initial\n');
		assert.strictEqual(copy.isDirty(), false);
		assert.strictEqual(copy.isLoaded, true);
		disposables.dispose();
	});

	test('updateContent toggles dirty on/off', async () => {
		const { copy, disposables } = make('# initial\n');
		await copy.load();
		const dirtyEvents: boolean[] = [];
		copy.onDidChangeDirty(() => dirtyEvents.push(copy.isDirty()), undefined, disposables);

		copy.updateContent('# changed\n');
		assert.strictEqual(copy.isDirty(), true);

		// Same content again shouldn't produce another event
		copy.updateContent('# changed\n');
		assert.strictEqual(dirtyEvents.length, 1);

		// Revert back to saved content
		copy.updateContent('# initial\n');
		assert.strictEqual(copy.isDirty(), false);
		assert.deepStrictEqual(dirtyEvents, [true, false]);
		disposables.dispose();
	});

	test('save writes to disk, clears dirty, fires onDidSave', async () => {
		const { copy, resource, fs, disposables } = make('# initial\n');
		await copy.load();
		copy.updateContent('# edited\n');

		let savedEventFired = false;
		copy.onDidSave(() => { savedEventFired = true; }, undefined, disposables);

		const ok = await copy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(ok, true);
		assert.strictEqual(copy.isDirty(), false);
		assert.strictEqual(fs.writeCalls.length, 1);
		assert.strictEqual(fs.writeCalls[0].resource, resource.toString());
		assert.strictEqual(fs.writeCalls[0].contents, '# edited\n');
		assert.strictEqual(savedEventFired, true);
		disposables.dispose();
	});

	test('save is a no-op when clean without force', async () => {
		const { copy, fs, disposables } = make('# initial\n');
		await copy.load();
		const ok = await copy.save();
		assert.strictEqual(ok, true);
		assert.strictEqual(fs.writeCalls.length, 0);
		disposables.dispose();
	});

	test('revert reloads disk content and clears dirty', async () => {
		const { copy, disposables, fs, resource } = make('# initial\n');
		await copy.load();
		copy.updateContent('# staged but not saved\n');
		assert.strictEqual(copy.isDirty(), true);

		// Someone else changes disk under us
		fs.files.set(resource.toString(), '# on-disk newer\n');

		await copy.revert();
		assert.strictEqual(copy.isDirty(), false);
		assert.strictEqual(copy.getContent(), '# on-disk newer\n');
		disposables.dispose();
	});

	test('backup returns a stream of the current content', async () => {
		const { copy, disposables } = make('# initial\n');
		await copy.load();
		copy.updateContent('# unsaved edit\n');

		const backup = await copy.backup({ isCancellationRequested: false } as any);
		// content is a stream — consume it
		const chunks: string[] = [];
		const stream = backup.content as any;
		await new Promise<void>((resolve, reject) => {
			stream.on('data', (chunk: any) => chunks.push(chunk.toString ? chunk.toString() : String(chunk)));
			stream.on('end', () => resolve());
			stream.on('error', reject);
		});
		assert.strictEqual(chunks.join(''), '# unsaved edit\n');
		disposables.dispose();
	});

	test('external change fires event with correct changeType', async () => {
		const { copy, resource, fs, disposables } = make('# initial\n');
		await copy.load();

		const events: FileChangeType[] = [];
		copy.onExternalChange(e => events.push(e.changeType), undefined, disposables);

		fs.emitChange(resource, FileChangeType.UPDATED);
		await flush();
		fs.emitChange(resource, FileChangeType.DELETED);
		await flush();

		assert.deepStrictEqual(events, [FileChangeType.UPDATED, FileChangeType.DELETED]);
		disposables.dispose();
	});

	test('external change during in-flight save is ignored (self-echo suppression)', async () => {
		const { copy, resource, fs, disposables } = make('# initial\n');
		await copy.load();
		copy.updateContent('# edit\n');

		let externalHits = 0;
		copy.onExternalChange(() => externalHits++, undefined, disposables);

		// Instrument fs.writeFile so the change event fires *while* the save is
		// still in flight — this is exactly the race we're guarding against.
		const originalWriteFile = fs.service.writeFile;
		fs.service.writeFile = async (r: URI, buf: VSBuffer) => {
			fs.emitChange(resource, FileChangeType.UPDATED);
			return originalWriteFile.call(fs.service, r, buf);
		};

		await copy.save({ reason: SaveReason.EXPLICIT });
		await flush();
		assert.strictEqual(externalHits, 0, 'self-write should not surface as external change');
		disposables.dispose();
	});

	// ---- T-3.8.2 · 三分支保存路径 -------------------------------------

	/** 构造一个 safe session payload —— 与 roundtripSerializer.test 中的 fixture 同形。 */
	function safeSessionPayload(epoch = 1) {
		return {
			type: 'sessionReady' as const,
			epoch,
			blockOrder: ['b1', 'b2'] as const,
			blockRanges: {
				b1: [0, 10] as [number, number],
				b2: [11, 21] as [number, number],
			},
			interstitial: [
				[0, 0] as [number, number],
				[10, 11] as [number, number],
				[21, 21] as [number, number],
			],
			coverage: 20 / 21,
			hasBOM: false,
			newlineStyle: 'LF' as const,
			safe: true,
		};
	}
	const SAFE_SOURCE = 'AAAAAAAAAA\nBBBBBBBBBB';

	test('T-3.8.2 · load 缓存 _openedBytes 与磁盘字节对齐', async () => {
		const { copy, disposables } = make(SAFE_SOURCE);
		await copy.load();
		const bytes = copy._testOpenedBytes;
		assert.ok(bytes, '_openedBytes 应被填充');
		assert.strictEqual(bytes!.length, SAFE_SOURCE.length);
		assert.strictEqual(new TextDecoder('utf-8').decode(bytes!), SAFE_SOURCE);
		disposables.dispose();
	});

	test('T-3.8.2 · 分支 A · dirty=[] + force save → 原字节回写', async () => {
		const { copy, fs, disposables } = make(SAFE_SOURCE);
		await copy.load();
		copy.updateSession(safeSessionPayload());
		// dirty=[] & contents={} —— pickSavePath 会选 A
		copy.updateContent(SAFE_SOURCE, [], {});
		// updateContent 因 markdown === _saved 保持 dirty=false，需要 force
		const ok = await copy.save({ force: true });
		assert.strictEqual(ok, true);
		assert.strictEqual(fs.writeCalls.length, 1);
		assert.strictEqual(fs.writeCalls[0].contents, SAFE_SOURCE);
		disposables.dispose();
	});

	test('T-3.8.2 · 分支 B · 单块 dirty + contents 齐 → 增量拼装', async () => {
		const { copy, fs, disposables } = make(SAFE_SOURCE);
		await copy.load();
		copy.updateSession(safeSessionPayload());
		// b1 换成 "CCCC"；结果应等于 "CCCC" + "\n" + "BBBBBBBBBB"
		copy.updateContent('CCCC\nBBBBBBBBBB', ['b1'], { b1: 'CCCC' });
		const ok = await copy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(ok, true);
		assert.strictEqual(fs.writeCalls.length, 1);
		assert.strictEqual(fs.writeCalls[0].contents, 'CCCC\nBBBBBBBBBB');
		disposables.dispose();
	});

	test('T-3.8.2 · 分支 C · session 缺失 → 全文回写 _current', async () => {
		const { copy, fs, disposables } = make(SAFE_SOURCE);
		await copy.load();
		// 不调 updateSession；session=null → C 分支
		copy.updateContent('# rewritten by webview\n');
		const ok = await copy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(ok, true);
		assert.strictEqual(fs.writeCalls.length, 1);
		assert.strictEqual(fs.writeCalls[0].contents, '# rewritten by webview\n');
		disposables.dispose();
	});

	test('T-3.8.2 · 分支 C · dirty 有 id 不在 session → 降级', async () => {
		const { copy, fs, disposables } = make(SAFE_SOURCE);
		await copy.load();
		copy.updateSession(safeSessionPayload());
		// 'phantom' 不在 session.blockOrder → pickSavePath 降级到 C
		copy.updateContent('unknown reshape', ['b1', 'phantom'], { b1: 'x', phantom: 'y' });
		const ok = await copy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(ok, true);
		assert.strictEqual(fs.writeCalls.length, 1);
		assert.strictEqual(fs.writeCalls[0].contents, 'unknown reshape');
		disposables.dispose();
	});

	test('T-3.8.2 · setPendingFormatPath(document) → 强制 C 分支', async () => {
		const { copy, fs, disposables } = make(SAFE_SOURCE);
		await copy.load();
		copy.updateSession(safeSessionPayload());
		// dirty 与 contents 齐，本来应走 B；但 forcePath='C' 会强制降级
		copy.updateContent('CCCC\nBBBBBBBBBB', ['b1'], { b1: 'CCCC' });
		copy.setPendingFormatPath('document');
		assert.strictEqual(copy._testPendingForcePath, 'C');
		const ok = await copy.save({ reason: SaveReason.EXPLICIT });
		assert.strictEqual(ok, true);
		// 走 C —— 写的是 _current，也就是 updateContent 传入的整篇
		assert.strictEqual(fs.writeCalls[0].contents, 'CCCC\nBBBBBBBBBB');
		// pendingForcePath 一次性消费
		assert.strictEqual(copy._testPendingForcePath, null);
		disposables.dispose();
	});

	test('T-3.8.2 · save 成功后清空 dirtyBlocks & session（B/C 分支）', async () => {
		const { copy, disposables } = make(SAFE_SOURCE);
		await copy.load();
		copy.updateSession(safeSessionPayload());
		copy.updateContent('CCCC\nBBBBBBBBBB', ['b1'], { b1: 'CCCC' });
		await copy.save({ reason: SaveReason.EXPLICIT });
		// B 分支：session 清空（等下次 sessionReady）
		assert.strictEqual(copy._testSession, null);
		// _openedBytes 刷新为新写入的字节
		const bytes = copy._testOpenedBytes;
		assert.ok(bytes);
		assert.strictEqual(new TextDecoder('utf-8').decode(bytes!), 'CCCC\nBBBBBBBBBB');
		disposables.dispose();
	});

	test('T-3.8.2 · load 重置 _openedBytes/_session/pendingForcePath', async () => {
		const { copy, disposables, fs, resource } = make(SAFE_SOURCE);
		await copy.load();
		copy.updateSession(safeSessionPayload());
		copy.setPendingFormatPath('document');
		assert.ok(copy._testSession);
		assert.strictEqual(copy._testPendingForcePath, 'C');

		fs.files.set(resource.toString(), 'RELOADED\n');
		await copy.load('externalChange');
		assert.strictEqual(copy._testSession, null);
		assert.strictEqual(copy._testPendingForcePath, null);
		assert.strictEqual(new TextDecoder('utf-8').decode(copy._testOpenedBytes!), 'RELOADED\n');
		disposables.dispose();
	});
});
