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
});
