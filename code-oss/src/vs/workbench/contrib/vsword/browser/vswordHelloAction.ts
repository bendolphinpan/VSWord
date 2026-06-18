/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';

class VswordHelloAction extends Action2 {
	static readonly ID = 'vsword.dev.hello';

	constructor() {
		super({
			id: VswordHelloAction.ID,
			title: localize2('vsword.dev.hello', "VSWord: Hello"),
			category: localize2('vsword', "VSWord"),
			f1: true
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(INotificationService).info('VSWord is alive');
	}
}

registerAction2(VswordHelloAction);
