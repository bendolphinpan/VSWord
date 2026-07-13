/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IIconLabelValueOptions, IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { IDataSource, ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import {
	IBreadcrumbsDataSource,
	IBreadcrumbsOutlineElement,
	IOutline,
	IOutlineComparator,
	IOutlineCreator,
	IOutlineListConfig,
	IOutlineService,
	IQuickPickDataSource,
	IQuickPickOutlineElement,
	OutlineChangeEvent,
} from '../../../../services/outline/browser/outline.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import type { WebviewHeading } from './milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * A single outline entry. Milkdown headings are flat as extracted from the webview;
 * we build parent/child links here using the classic "next same-or-shallower level
 * ends the current subtree" rule.
 */
export class MilkdownOutlineEntry {
	public parent: MilkdownOutlineEntry | undefined;
	public readonly children: MilkdownOutlineEntry[] = [];

	constructor(
		public readonly id: string,
		public readonly label: string,
		public readonly level: number,
		public readonly pos: number,
	) { }
}

/** Assemble a flat heading list into a hierarchy driven by header level. */
export function buildOutlineTree(headings: readonly WebviewHeading[]): MilkdownOutlineEntry[] {
	const roots: MilkdownOutlineEntry[] = [];
	const stack: MilkdownOutlineEntry[] = [];
	for (const h of headings) {
		const entry = new MilkdownOutlineEntry(h.id, h.text || h.id, h.level, h.pos);
		while (stack.length && stack[stack.length - 1].level >= entry.level) {
			stack.pop();
		}
		if (stack.length === 0) {
			roots.push(entry);
		} else {
			const parent = stack[stack.length - 1];
			entry.parent = parent;
			parent.children.push(entry);
		}
		stack.push(entry);
	}
	return roots;
}

/** Walk every entry in pre-order (roots first, then children). */
function forEachEntry(roots: readonly MilkdownOutlineEntry[], fn: (e: MilkdownOutlineEntry) => void): void {
	for (const root of roots) {
		fn(root);
		forEachEntry(root.children, fn);
	}
}

// ---------------------------------------------------------------------------
// Tree plumbing (delegate / renderer / data source / comparator / picks)
// ---------------------------------------------------------------------------

/** 用 keyword 图标；标题正文走 label，避免 symbolNumber 看起来像光秃秃的 ## */
const HEADING_ICONS: Record<number, ThemeIcon> = {
	1: Codicon.symbolKeyword,
	2: Codicon.symbolKeyword,
	3: Codicon.symbolKeyword,
	4: Codicon.symbolKeyword,
	5: Codicon.symbolKeyword,
	6: Codicon.symbolKeyword,
};

class MilkdownOutlineTemplate {
	static readonly templateId = 'MilkdownOutlineTemplate';
	constructor(
		readonly container: HTMLElement,
		readonly iconClass: HTMLElement,
		readonly iconLabel: IconLabel,
	) { }
}

class MilkdownOutlineRenderer implements ITreeRenderer<MilkdownOutlineEntry, FuzzyScore, MilkdownOutlineTemplate> {
	templateId = MilkdownOutlineTemplate.templateId;

	renderTemplate(container: HTMLElement): MilkdownOutlineTemplate {
		container.classList.add('vsword-outline-element');
		const iconClass = DOM.append(container, DOM.$('.element-icon'));
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		return new MilkdownOutlineTemplate(container, iconClass, iconLabel);
	}

	renderElement(node: ITreeNode<MilkdownOutlineEntry, FuzzyScore>, _index: number, template: MilkdownOutlineTemplate): void {
		const level = Math.min(6, Math.max(1, node.element.level));
		const icon = HEADING_ICONS[level];
		template.iconClass.className = 'element-icon ' + ThemeIcon.asClassNameArray(icon).join(' ');
		// 主标签必须是标题正文；description 用 H1..H6，避免「只有 ## 没字」
		const title = (node.element.label && node.element.label.trim()) || `(H${level})`;
		const options: IIconLabelValueOptions = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
			title: `H${level} ${title}`,
			extraClasses: [`vsword-outline-h${level}`],
		};
		template.iconLabel.setLabel(title, `H${level}`, options);
	}

	disposeTemplate(template: MilkdownOutlineTemplate): void {
		template.iconLabel.dispose();
	}
}

class MilkdownOutlineVirtualDelegate implements IListVirtualDelegate<MilkdownOutlineEntry> {
	getHeight(): number { return 22; }
	getTemplateId(): string { return MilkdownOutlineTemplate.templateId; }
}

class MilkdownOutlineIdentityProvider implements IIdentityProvider<MilkdownOutlineEntry> {
	getId(element: MilkdownOutlineEntry): string { return element.id; }
}

class MilkdownOutlineNavLabelProvider implements IKeyboardNavigationLabelProvider<MilkdownOutlineEntry> {
	getKeyboardNavigationLabel(element: MilkdownOutlineEntry): string { return element.label; }
}

class MilkdownOutlineAccessibilityProvider implements IListAccessibilityProvider<MilkdownOutlineEntry> {
	getAriaLabel(element: MilkdownOutlineEntry): string { return `H${element.level} ${element.label}`; }
	getWidgetAriaLabel(): string { return localize('vswordOutline.aria', "VSWord Markdown Outline"); }
}

class MilkdownOutlineComparator implements IOutlineComparator<MilkdownOutlineEntry> {
	compareByPosition(a: MilkdownOutlineEntry, b: MilkdownOutlineEntry): number { return a.pos - b.pos; }
	compareByType(a: MilkdownOutlineEntry, b: MilkdownOutlineEntry): number { return a.level - b.level; }
	compareByName(a: MilkdownOutlineEntry, b: MilkdownOutlineEntry): number { return a.label.localeCompare(b.label); }
}

class MilkdownOutlineDataSource implements IDataSource<MilkdownOutline, MilkdownOutlineEntry> {
	constructor(private readonly _outline: MilkdownOutline) { }
	getChildren(element: MilkdownOutline | MilkdownOutlineEntry): Iterable<MilkdownOutlineEntry> {
		if (element === this._outline) {
			return this._outline.roots;
		}
		return (element as MilkdownOutlineEntry).children;
	}
}

class MilkdownBreadcrumbsSource implements IBreadcrumbsDataSource<MilkdownOutlineEntry> {
	private _crumbs: IBreadcrumbsOutlineElement<MilkdownOutlineEntry>[] = [];
	getBreadcrumbElements(): readonly IBreadcrumbsOutlineElement<MilkdownOutlineEntry>[] { return this._crumbs; }
	update(active: MilkdownOutlineEntry | undefined): void {
		const chain: MilkdownOutlineEntry[] = [];
		for (let cur = active; cur; cur = cur.parent) chain.push(cur);
		chain.reverse();
		this._crumbs = chain.map(e => ({ element: e, label: e.label }));
	}
}

class MilkdownQuickPickSource implements IQuickPickDataSource<MilkdownOutlineEntry> {
	constructor(private readonly _outline: MilkdownOutline) { }
	getQuickPickElements(): IQuickPickOutlineElement<MilkdownOutlineEntry>[] {
		const items: IQuickPickOutlineElement<MilkdownOutlineEntry>[] = [];
		forEachEntry(this._outline.roots, e => {
			items.push({
				element: e,
				label: e.label,
				ariaLabel: `H${e.level} ${e.label}`,
				iconClasses: ThemeIcon.asClassNameArray(HEADING_ICONS[Math.min(6, Math.max(1, e.level))]),
				description: `H${e.level}`,
			});
		});
		return items;
	}
}

// ---------------------------------------------------------------------------
// IOutline implementation
// ---------------------------------------------------------------------------

export class MilkdownOutline extends Disposable implements IOutline<MilkdownOutlineEntry> {

	readonly outlineKind = 'vswordMarkdown';

	private readonly _onDidChange = this._register(new Emitter<OutlineChangeEvent>());
	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _roots: MilkdownOutlineEntry[] = [];
	private _activeEntry: MilkdownOutlineEntry | undefined;

	private readonly _breadcrumbs = new MilkdownBreadcrumbsSource();

	readonly config: IOutlineListConfig<MilkdownOutlineEntry>;

	constructor(
		private readonly _input: MilkdownEditorInput,
		private readonly _revealHeading: (pos: number) => void,
	) {
		super();

		const delegate = new MilkdownOutlineVirtualDelegate();
		const renderers = [new MilkdownOutlineRenderer()];
		const treeDataSource = new MilkdownOutlineDataSource(this);
		const comparator = new MilkdownOutlineComparator();
		const quickPickDataSource = new MilkdownQuickPickSource(this);

		this.config = {
			breadcrumbsDataSource: this._breadcrumbs,
			treeDataSource,
			delegate,
			renderers,
			comparator,
			options: {
				collapseByDefault: false,
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				identityProvider: new MilkdownOutlineIdentityProvider(),
				keyboardNavigationLabelProvider: new MilkdownOutlineNavLabelProvider(),
				accessibilityProvider: new MilkdownOutlineAccessibilityProvider(),
			},
			quickPickDataSource,
		};

		this._register(this._input.onOutlineDataChanged(data => this._applyHeadings(data.headings, data.activeId)));

		// Seed with whatever the input already has (survives outline pane re-mount).
		const snapshot = this._input.getOutlineSnapshot();
		if (snapshot) {
			this._applyHeadings(snapshot.headings, snapshot.activeId);
		}
	}

	get uri(): URI | undefined { return this._input.resource; }
	get isEmpty(): boolean { return this._roots.length === 0; }
	get activeElement(): MilkdownOutlineEntry | undefined { return this._activeEntry; }
	get roots(): readonly MilkdownOutlineEntry[] { return this._roots; }

	private _applyHeadings(headings: readonly WebviewHeading[], activeId: string | null): void {
		this._roots = buildOutlineTree(headings);
		this._activeEntry = undefined;
		if (activeId) {
			forEachEntry(this._roots, e => {
				if (e.id === activeId) this._activeEntry = e;
			});
		}
		this._breadcrumbs.update(this._activeEntry);
		this._onDidChange.fire({});
	}

	reveal(entry: MilkdownOutlineEntry, _options: IEditorOptions, _sideBySide: boolean, _select: boolean): void {
		this._revealHeading(entry.pos);
	}

	preview(_entry: MilkdownOutlineEntry): IDisposable { return toDisposable(() => { }); }

	captureViewState(): IDisposable {
		const savedActive = this._activeEntry;
		return toDisposable(() => {
			// Best-effort restore; concrete reveal is a webview op we can't force from here.
			this._activeEntry = savedActive;
		});
	}
}

// ---------------------------------------------------------------------------
// IOutlineCreator registration
// ---------------------------------------------------------------------------

class MilkdownOutlineCreator implements IOutlineCreator<IEditorPane, MilkdownOutlineEntry> {
	matches(candidate: IEditorPane): candidate is IEditorPane {
		return candidate?.input instanceof MilkdownEditorInput;
	}
	async createOutline(editor: IEditorPane): Promise<IOutline<MilkdownOutlineEntry> | undefined> {
		const input = editor.input;
		if (!(input instanceof MilkdownEditorInput)) return undefined;
		return new MilkdownOutline(input, pos => input.requestRevealHeading(pos));
	}
}

class MilkdownOutlineContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.vsword.milkdownOutline';
	constructor(@IOutlineService outlineService: IOutlineService) {
		super();
		this._register(outlineService.registerOutlineCreator(new MilkdownOutlineCreator()));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MilkdownOutlineContribution, LifecyclePhase.Restored);
