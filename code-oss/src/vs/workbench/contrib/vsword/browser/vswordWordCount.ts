/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { countWords, parseFrontmatter } from '../common/vswordDocumentUtils.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';

const VSWORD_SHOW_WORD_COUNT_COMMAND_ID = 'vsword.actions.showWordCount';
const VSWORD_CATEGORY = localize2('vsword', 'VSWord');

/**
 * Status bar entry that shows word count for the active editor.
 */
export class VswordWordCountContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.vsword.wordCount';

	private readonly _wordCountEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly _modelListener = this._register(new MutableDisposable());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) {
		super();

		this._register(this._editorService.onDidActiveEditorChange(() => this._onActiveEditorChanged()));
		// initial update
		this._onActiveEditorChanged();
	}

	private _onActiveEditorChanged(): void {
		// Clear previous model listener
		this._modelListener.clear();

		const editor = this._editorService.activeTextEditorControl;
		const codeEditor = getCodeEditor(editor);
		if (!codeEditor) {
			this._wordCountEntry.clear();
			return;
		}

		const model = codeEditor.getModel();
		if (!model) {
			this._wordCountEntry.clear();
			return;
		}

		const languageId = model.getLanguageId();
		// Only show word count for Markdown and plain text documents
		if (languageId !== 'markdown' && languageId !== 'plaintext') {
			this._wordCountEntry.clear();
			return;
		}

		// Listen for content changes
		this._modelListener.value = model.onDidChangeContent((_e: IModelContentChangedEvent) => {
			this._updateWordCount(model.getValue());
		});

		// Initial word count
		this._updateWordCount(model.getValue());
	}

	private _updateWordCount(text: string): void {
		const bodyText = parseFrontmatter(text).body;
		const result = countWords(bodyText);

		const entry: IStatusbarEntry = {
			name: localize('vsword.wordCount', 'VSWord Word Count'),
			text: localize({ key: 'vswordWordCount', comment: ['{0} is the word count number'] }, 'Words: {0}', result.words),
			ariaLabel: localize({ key: 'vswordWordCountAria', comment: ['{0} is the word count number'] }, 'Word count: {0}', result.words),
			tooltip: localize(
				{ key: 'vswordWordCountTooltip', comment: ['{0}=chars, {1}=CJK chars, {2}=words, {3}=lines'] },
				'Characters: {0} | CJK Chars: {1} | Words: {2} | Lines: {3}',
				result.chars,
				result.cjkChars,
				result.words,
				result.lines
			),
			command: VSWORD_SHOW_WORD_COUNT_COMMAND_ID
		};

		if (this._wordCountEntry.value) {
			this._wordCountEntry.value.update(entry);
		} else {
			this._wordCountEntry.value = this._statusbarService.addEntry(entry, 'vsword.wordCount', StatusbarAlignment.RIGHT, 100);
		}
	}
}

// Register the "show word count detail" command
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VSWORD_SHOW_WORD_COUNT_COMMAND_ID,
			title: localize2('vsword.actions.showWordCount', 'VSWord: Show Word Count Details'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override run(accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const editor = editorService.activeTextEditorControl;
		const codeEditor = getCodeEditor(editor);
		if (!codeEditor) {
			notificationService.info(localize('vsword.noActiveEditor', 'No active text editor.'));
			return;
		}

		const model = codeEditor.getModel();
		if (!model) {
			notificationService.info(localize('vsword.noActiveEditor', 'No active text editor.'));
			return;
		}

		const text = model.getValue();
		const fmResult = parseFrontmatter(text);
		const result = countWords(fmResult.body);

		notificationService.info(localize(
			{ key: 'vswordWordCountDetail', comment: ['{0}=chars, {1}=CJK chars, {2}=words, {3}=lines, {4}=hasFrontmatter'] },
			'VSWord — Total chars: {0} | CJK: {1} | Words: {2} | Lines: {3}{4}',
			result.chars,
			result.cjkChars,
			result.words,
			result.lines,
			fmResult.hasFrontmatter ? ' | Frontmatter: yes' : ''
		));
	}
});