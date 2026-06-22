/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Session-scoped counter for new Markdown documents.
 *
 * Resets on each Workbench load — collisions with previously-saved files
 * are not a concern because untitled resources never hit disk until the
 * user explicitly saves and renames them.
 */
let newMarkdownCounter = 0;

/**
 * Returns true when the date is "today" relative to the previous call —
 * used to reset the per-day counter when the user keeps the app open
 * across midnight.
 */
let lastDayKey: string | undefined;

function dayKey(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build an untitled Markdown resource named `YYYY-MM-DD_newN.md`.
 *
 * The numeric suffix resets when the calendar day changes, so a file
 * created on the morning of June 23 is `2026-06-23_new1.md` rather than
 * `2026-06-23_new47.md` just because the app stayed open through the night.
 */
export function createUntitledMarkdownResource(date: Date = new Date()): URI {
	const today = dayKey(date);
	if (today !== lastDayKey) {
		newMarkdownCounter = 0;
		lastDayKey = today;
	}
	newMarkdownCounter++;
	// IMPORTANT: untitled resources derive their tab "description" (the grey
	// suffix after the slash) from `resource.path` when it differs from the
	// basename — see UntitledTextEditorInput#getDescription. Setting path to
	// `/foo.md` makes name=`foo.md` and description=`/foo.md`, which renders
	// in the tab as `foo.md / foo.md` (the duplicate title the user reported).
	// Using the bare filename — no leading slash — keeps name === resource.path
	// so the description is suppressed and the tab shows the filename once.
	return URI.from({ scheme: Schemas.untitled, path: `${today}_new${newMarkdownCounter}.md` });
}
