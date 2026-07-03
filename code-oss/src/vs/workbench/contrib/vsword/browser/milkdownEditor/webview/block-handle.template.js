/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8 — block hover handle.
//
// Wires @milkdown/plugin-block into VSWord. plugin-block gives us the "current
// block under the cursor" tracking + drag-to-reorder + native DnD boundary
// drawing; we contribute:
//
//   • the DOM handle itself (a six-dot icon that anchors to the block's left)
//   • Q5=b filter: no handle inside tables, and no handle on bare list_items
//   • click-to-open block menu (transform + duplicate/delete/move)
//
// The handle DOM element is created once and re-positioned by BlockProvider's
// floating-ui update loop.

import { block, blockConfig, BlockProvider } from '@milkdown/plugin-block';
import { findParent } from '@milkdown/prose';
import { BlockHandleMenu } from './block-handle-menu.mjs';
import { shouldShowHandle } from './block-handle-helpers.mjs';

/**
 * Q5=b — plugin-block filter: exclude tables *and* list_items. plugin-block
 * itself already skips tables by default, but we redeclare the whole rule so
 * both criteria are visible in one place.
 */
function nodeFilter($pos, node) {
	if (findParent(n => n.type.name === 'table')($pos)) return false;
	if (node && node.type && node.type.name === 'list_item') return false;
	// Collect ancestor names for the pure helper's second axis.
	const ancestors = [];
	for (let d = $pos.depth; d > 0; d--) ancestors.push($pos.node(d).type.name);
	return shouldShowHandle({ typeName: node && node.type ? node.type.name : '' }, ancestors);
}

/**
 * Build the handle DOM element and hand it to plugin-block via
 * BlockProvider. Called once per editor mount from entry.template.js.
 *
 * @param {Ctx} ctx        Milkdown context
 * @param {HTMLElement} editorRoot   #milkdown-root
 * @returns {{ destroy: () => void }}
 */
export function installBlockHandle(ctx, editorRoot) {
	const handle = document.createElement('button');
	handle.type = 'button';
	handle.className = 'vsword-block-handle';
	handle.setAttribute('aria-label', '块操作');
	handle.setAttribute('tabindex', '-1');
	// Six-dot glyph (⋮⋮). Two vertical ellipses side by side render cleanly at
	// 12–14px and don't depend on an icon font.
	handle.innerHTML = '<span aria-hidden="true">⋮⋮</span>';

	const menu = new BlockHandleMenu(ctx, editorRoot);

	handle.addEventListener('mousedown', (e) => {
		// Left-click without drag intent → open menu. plugin-block treats a
		// mousedown as the start of a drag; we let it do that for its own
		// dragging bookkeeping, but our own menu opens on `click` after mouseup
		// with no movement (see click handler below).
		// Right-click is left to browser default context menu.
	});
	// Click = show menu (not drag). BlockProvider swallows dblclick as drag.
	handle.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const active = provider.active;
		if (!active) return;
		menu.open(handle, active);
	});

	const provider = new BlockProvider({
		ctx,
		content: handle,
		root: editorRoot,
		getOffset: () => ({ mainAxis: 8, crossAxis: 0 }),
		// Anchor to the left edge of the block, vertically at the top row.
		getPlacement: () => 'left-start',
	});
	provider.update();

	return {
		destroy() {
			menu.destroy();
			provider.destroy();
			handle.remove();
		},
	};
}

/** Plugin tuple to be spread into the editor `.use()` chain. plugin-block's
 *  `block` export already contains blockSpec + blockConfig + blockService +
 *  blockServiceInstance + $Prose, so `.use(block)` is enough. */
export const blockHandlePlugins = block;

/** Called from `.config()` — installs the filter override. */
export function configureBlockHandle(ctx) {
	ctx.set(blockConfig.key, { filterNodes: nodeFilter });
}
