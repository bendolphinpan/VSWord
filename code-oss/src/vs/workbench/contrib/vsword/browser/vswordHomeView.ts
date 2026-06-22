/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, addDisposableListener } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { isRecentFile, isRecentFolder, isRecentWorkspace, IRecent, IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions, ViewContainerLocation } from '../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { createUntitledMarkdownResource } from '../common/vswordMarkdown.js';

export const VSWORD_HOME_VIEW_CONTAINER_ID = 'workbench.view.vsword.home';
export const VSWORD_HOME_VIEW_ID = 'vsword.home';

const vswordHomeIcon = registerIcon('vsword-home-view-icon', Codicon.book, localize('vswordHomeIcon', 'View icon of the VSWord Home view.'));

class VswordHomeView extends ViewPane {

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IEditorService private readonly editorService: IEditorService,
		@IHostService private readonly hostService: IHostService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('vsword-home-view');
		this.renderHome(container).catch(error => this.notificationService.error(error));
	}

	private async renderHome(container: HTMLElement): Promise<void> {
		clearNode(container);

		const root = append(container, $('.vsword-home'));
		root.style.padding = '16px';
		root.style.boxSizing = 'border-box';
		root.style.height = '100%';
		root.style.overflow = 'auto';

		const title = append(root, $('h2', undefined, localize('vswordHomeTitle', 'VSWord')));
		title.style.margin = '0 0 8px';
		append(root, $('p', undefined, localize('vswordHomeSubtitle', 'A writing-first workspace for Markdown, blocks, canvas, and mind maps.')));

		const actions = append(root, $('.vsword-home-actions'));
		actions.style.display = 'flex';
		actions.style.flexDirection = 'column';
		actions.style.gap = '8px';
		actions.style.margin = '16px 0 20px';

		this.renderButton(actions, localize('vswordNewMarkdown', 'New Markdown Document'), () => this.newMarkdownDocument());
		this.renderButton(actions, localize('vswordOpenFolder', 'Open Folder...'), () => this.commandService.executeCommand('workbench.action.files.openFolder'));
		this.renderButton(actions, localize('vswordOpenFile', 'Open File...'), () => this.commandService.executeCommand('workbench.action.files.openFile'));
		this.renderButton(actions, localize('vswordShowExplorer', 'Show File Explorer'), () => this.commandService.executeCommand('workbench.view.explorer'));
		this.renderButton(actions, localize('vswordShowOutline', 'Show Outline'), () => this.commandService.executeCommand('outline.focus'));
		this.renderButton(actions, localize('vswordOpenCanvas', 'Open Canvas'), () => this.commandService.executeCommand('vsword.actions.openCanvas'));
		this.renderButton(actions, localize('vswordOpenMindMap', 'Open Mind Map'), () => this.notificationService.info(localize('vswordMindMapComingSoon', 'Mind Map is coming in T-5.')));
		this.renderButton(actions, localize('vswordRefreshRecent', 'Refresh Recent'), () => this.renderHome(container));

		append(root, $('h3', undefined, localize('vswordRecent', 'Recent')));
		const recents = append(root, $('.vsword-home-recents'));
		const recentlyOpened = await this.workspacesService.getRecentlyOpened();
		const items: IRecent[] = [...recentlyOpened.files, ...recentlyOpened.workspaces].slice(0, 10);

		if (!items.length) {
			append(recents, $('p', undefined, localize('vswordNoRecent', 'No recent files or folders yet.')));
			return;
		}

		for (const recent of items) {
			const label = this.recentLabel(recent);
			this.renderButton(recents, label, () => this.openRecent(recent));
		}
	}

	private renderButton(container: HTMLElement, label: string, run: () => unknown): void {
		const button = append(container, $('button', { type: 'button' }, label));
		button.style.textAlign = 'left';
		button.style.padding = '6px 10px';
		button.style.border = '1px solid var(--vscode-button-border, transparent)';
		button.style.borderRadius = '4px';
		button.style.color = 'var(--vscode-button-foreground)';
		button.style.background = 'var(--vscode-button-background)';
		this._register(addDisposableListener(button, 'click', () => { run(); }));
	}

	private recentLabel(recent: IRecent): string {
		if (recent.label) {
			return recent.label;
		}
		if (isRecentFile(recent)) {
			return recent.fileUri.fsPath || recent.fileUri.toString(true);
		}
		if (isRecentFolder(recent)) {
			return recent.folderUri.fsPath || recent.folderUri.toString(true);
		}
		return recent.workspace.configPath.fsPath || recent.workspace.configPath.toString(true);
	}

	private async openRecent(recent: IRecent): Promise<void> {
		if (isRecentFile(recent)) {
			await this.editorService.openEditor({ resource: recent.fileUri, options: { pinned: true } });
			return;
		}
		if (isRecentFolder(recent)) {
			await this.hostService.openWindow([{ folderUri: recent.folderUri }], { remoteAuthority: recent.remoteAuthority || null });
			return;
		}
		if (isRecentWorkspace(recent)) {
			await this.hostService.openWindow([{ workspaceUri: recent.workspace.configPath }], { remoteAuthority: recent.remoteAuthority || null });
		}
	}

	private async newMarkdownDocument(): Promise<void> {
		await this.editorService.openEditor({
			resource: createUntitledMarkdownResource(),
			languageId: 'markdown',
			options: { pinned: true }
		});
	}
}

const viewContainer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({
	id: VSWORD_HOME_VIEW_CONTAINER_ID,
	title: localize2('vswordHomeContainer', 'Home'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VSWORD_HOME_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	icon: ThemeIcon.fromId(vswordHomeIcon.id),
	order: -1,
	storageId: 'vsword.home.views.state',
	openCommandActionDescriptor: {
		id: VSWORD_HOME_VIEW_CONTAINER_ID,
		title: localize2('vswordOpenHome', 'VSWord Home'),
		order: -1
	}
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([{ 
	id: VSWORD_HOME_VIEW_ID,
	name: localize2('vswordHomeViewName', 'VSWord Home'),
	containerIcon: ThemeIcon.fromId(vswordHomeIcon.id),
	ctorDescriptor: new SyncDescriptor(VswordHomeView),
	canToggleVisibility: false,
	order: 0,
	weight: 100,
	focusCommand: { id: VSWORD_HOME_VIEW_ID }
}], viewContainer);

export class VswordWorkbenchShellContribution {
	static readonly ID = 'workbench.contrib.vsword.shell';

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		layoutService.setPartHidden(true, Parts.PANEL_PART);
	}
}
