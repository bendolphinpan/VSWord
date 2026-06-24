/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VSWord — auto-open .mm files in the mindmap webview by default.
 *
 * Rationale: out of the box, .mm files resolve to the generic text editor. That
 * shows raw FreeMind XML, which is useless to mindmap users. Until we publish a
 * full custom editor (with serializer + diff), this contribution watches for a
 * .mm file landing in a text editor and silently swaps it for the mindmap
 * webview.
 *
 * Escape hatch: the explorer context menu exposes "Open .mm as Text" (command
 * `vsword.actions.openMindmapAsText`). Invoking it records the resource as
 * "text preferred" for the rest of the session so the auto-swap stays out of
 * the way.
 *
 * This is a lightweight stop-gap that lives entirely on top of existing public
 * services (IEditorService.onDidActiveEditorChange + the
 * vsword.actions.openMindmap action) without forking the editor resolver.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

const TEXT_EDITOR_INPUT_TYPE_ID = 'workbench.editors.files.textFileEditor';
const TEXT_EDITOR_RESOURCE_TYPE_ID = 'workbench.editors.files.fileEditorInput';
const MINDMAP_OPEN_COMMAND = 'vsword.actions.openMindmap';
const VSWORD_CATEGORY = localize2('vsword', 'VSWord');

/**
 * Shared in-memory set of resources the user explicitly asked to view as text
 * during this workbench session. Exported so the matching action below and the
 * auto-open contribution share a single source of truth.
 */
const textPreferred = new Set<string>();

export class VswordMindmapAutoOpenContribution extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'vsword.mindmap.autoOpen';

	private busySwap = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.maybeSwap();
		}));
		// Handle the case where a .mm file is already open when this
		// contribution boots (e.g. restored from previous session).
		this.maybeSwap();
	}

	private maybeSwap(): void {
		if (this.busySwap) {
			return;
		}
		const active = this.editorService.activeEditor;
		if (!active) {
			return;
		}
		const resource = active.resource;
		if (!resource || !this.isMindmapResource(resource)) {
			return;
		}
		if (textPreferred.has(resource.toString())) {
			return;
		}
		// Only intercept when the active input is a text-file editor, NOT our
		// own webview. The webview input does not expose `.resource` so this
		// guard mostly catches the text fallback path.
		const typeId = active.typeId;
		if (typeId !== TEXT_EDITOR_INPUT_TYPE_ID && typeId !== TEXT_EDITOR_RESOURCE_TYPE_ID) {
			return;
		}
		this.busySwap = true;
		const activeForClose = this.editorService.activeEditorPane;
		(async () => {
			try {
				// Open the mindmap first so the user never sees an empty editor
				// flash; then close the redundant text editor in the same group.
				await this.commandService.executeCommand(MINDMAP_OPEN_COMMAND, resource);
				if (activeForClose) {
					try {
						await activeForClose.group.closeEditor(active, { preserveFocus: false });
					} catch (err) {
						this.logService.debug('[VSWord Mindmap] auto-open: close text editor failed: ' + err);
					}
				}
			} catch (err) {
				this.logService.error('[VSWord Mindmap] auto-open failed: ' + err);
			} finally {
				this.busySwap = false;
			}
		})();
	}

	private isMindmapResource(resource: URI): boolean {
		return resource.path.toLowerCase().endsWith('.mm');
	}
}

/**
 * Escape hatch: opens the .mm file in the plain text editor and remembers the
 * choice for the session. Exposed in the Explorer context menu under
 * `navigation` group so it sits next to "Open as Mindmap".
 */
class VswordOpenMindmapAsTextAction extends Action2 {
	static readonly ID = 'vsword.actions.openMindmapAsText';

	constructor() {
		super({
			id: VswordOpenMindmapAsTextAction.ID,
			title: localize2('vswordOpenMindmapAsText', 'Open .mm as Text'),
			category: VSWORD_CATEGORY,
			f1: false,
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: 'navigation',
					order: 30,
					when: ContextKeyExpr.equals('resourceExtname', '.mm'),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, resource?: URI | { resource: URI }): Promise<void> {
		const uri = extractResource(resource);
		if (!uri || !uri.path.toLowerCase().endsWith('.mm')) {
			return;
		}
		// Mark first so the auto-swap stays out of the way for this session.
		textPreferred.add(uri.toString());
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({
			resource: uri,
			options: { override: 'default' as any, pinned: true },
		});
	}
}

function extractResource(resource?: URI | { resource: URI }): URI | undefined {
	if (!resource) {
		return undefined;
	}
	if (URI.isUri(resource)) {
		return resource;
	}
	if (typeof resource === 'object' && 'resource' in resource && URI.isUri((resource as any).resource)) {
		return (resource as any).resource;
	}
	return undefined;
}

registerAction2(VswordOpenMindmapAsTextAction);
