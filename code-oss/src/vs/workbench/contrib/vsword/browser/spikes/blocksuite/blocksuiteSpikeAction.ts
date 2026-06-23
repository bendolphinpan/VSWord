/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWebviewWorkbenchService } from '../../../../webviewPanel/browser/webviewWorkbenchService.js';
import { getBlockSuiteSpikeHtml } from './blocksuiteSpikeHtml.js';

const VIEW_TYPE = 'vsword.dev.blocksuiteSpike';

class VSWordOpenBlockSuiteSpikeAction extends Action2 {
	static readonly ID = 'vsword.dev.openBlockSuiteSpike';

	constructor() {
		super({
			id: VSWordOpenBlockSuiteSpikeAction.ID,
			title: localize2('vswordOpenBlockSuiteSpike', 'VSWord Dev: Open BlockSuite Spike'),
			category: localize2('vsword', 'VSWord'),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const webviewWorkbenchService = accessor.get(IWebviewWorkbenchService);
		const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/spikes/blocksuite/vendor');
		const scriptUri = URI.joinPath(vendorRoot, 'index.js');
		const styleUri = URI.joinPath(vendorRoot, 'style.css');

		const input = webviewWorkbenchService.openWebview(
			{
				providedViewType: VIEW_TYPE,
				extension: undefined,
				origin: 'vsword-blocksuite-spike',
				title: 'BlockSuite Spike',
				options: { enableFindWidget: true, retainContextWhenHidden: true },
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [vendorRoot],
				},
			},
			VIEW_TYPE,
			'BlockSuite Spike',
			undefined,
			{ preserveFocus: false }
		);

		input.webview.setHtml(getBlockSuiteSpikeHtml(scriptUri, styleUri));
	}
}

registerAction2(VSWordOpenBlockSuiteSpikeAction);
