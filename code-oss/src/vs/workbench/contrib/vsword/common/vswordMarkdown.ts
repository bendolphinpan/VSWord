/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';

export function createUntitledMarkdownResource(date: Date = new Date()): URI {
	const timestamp = date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
	return URI.from({ scheme: Schemas.untitled, path: `/VSWord-${timestamp}.md` });
}
