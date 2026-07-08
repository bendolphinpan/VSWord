// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.3.b · Find keymap PM Plugin。
 *
 *  职责：在 EditorView 层拦截 Ctrl/Cmd+F、Ctrl/Cmd+H、Escape，桥接到 widget 的
 *  open() / openReplace() / close()。Enter / Shift+Enter 不在这里 —— 那是 widget
 *  input 的原生 keydown 责任，避免拦截了正常换行输入。
 *
 *  关键决策（PRD §4.6 · §7 D-4）：
 *    · 走 `new Plugin({ props: { handleKeyDown } })`，跟 focus-mode 一致，不引入
 *      `prosemirror-keymap` 包（构建产物零多余依赖）。
 *    · 快捷键在 PM view 有焦点时生效；widget input 有焦点时由 widget 自处理，双
 *      通道互补（Esc 在两处都拦，让"widget 打开→Esc 关"跨焦点也成立）。
 *    · Mac 用 metaKey，其他平台用 ctrlKey；`event.metaKey || event.ctrlKey` 兼容。
 *    · handleKeyDown 返回 true → PM 视为已处理，webview 不再冒泡到 VS Code shell，
 *      从而覆盖 Code-OSS 的 Ctrl+F 默认（找在文件里）。
 *
 *  依赖：
 *    · widget 需要暴露 open() / openReplace() / close() / isOpen()（见 find-widget.template.js）
 *
 *  外挂方式（entry.template.js）：
 *    .use($prose(() => createFindKeymap(widget)))
 *--------------------------------------------------------------------------------------------*/

import { Plugin, PluginKey } from '@milkdown/prose/state';

export const findKeymapKey = new PluginKey('vsword-find-keymap');

/**
 * 判断 event 上的 modifier 是不是"Cmd（Mac）/ Ctrl（其他）"。
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isCmdOrCtrl(event) {
	if (!event) { return false; }
	// Mac 上 metaKey = Cmd；其他平台 ctrlKey = Ctrl。两处判断以兼容跨平台。
	return !!(event.metaKey || event.ctrlKey);
}

/**
 * 创建 find keymap PM plugin。
 *
 * @param {import('./find-widget.mjs').IFindWidgetComponent | { open: Function, openReplace: Function, close: Function, isOpen: Function }} widget
 * @param {Object} [opts]
 * @param {() => string} [opts.getMode]  —— 视图模式读取器；'reading' 时 Ctrl+H 完全 no-op（T-3.7c.3.c 二次防护）
 * @returns {Plugin}
 */
export function createFindKeymap(widget, opts) {
	if (!widget) {
		throw new Error('createFindKeymap: widget 不能为空');
	}
	const getMode = (opts && typeof opts.getMode === 'function') ? opts.getMode : () => 'wysiwyg';
	return new Plugin({
		key: findKeymapKey,
		props: {
			/**
			 * @param {any} _view
			 * @param {KeyboardEvent} event
			 * @returns {boolean}
			 */
			handleKeyDown(_view, event) {
				if (!event || typeof event.key !== 'string') { return false; }
				const key = event.key;
				// Ctrl/Cmd + F → open find
				if (isCmdOrCtrl(event) && !event.shiftKey && !event.altKey && (key === 'f' || key === 'F')) {
					try {
						widget.open?.();
						event.preventDefault?.();
					} catch { /* noop */ }
					return true;
				}
				// Ctrl/Cmd + H → open find+replace（reading mode 下**完全 no-op** —— 不呼出替换栏）
				if (isCmdOrCtrl(event) && !event.shiftKey && !event.altKey && (key === 'h' || key === 'H')) {
					let mode = 'wysiwyg';
					try { mode = getMode() || 'wysiwyg'; } catch { /* noop */ }
					if (mode === 'reading') {
						// 二次防护：reading 模式下 Ctrl+H 不呼出替换栏；但仍拦截，避免冒泡触发
						// 浏览器/VS Code shell 默认（Ctrl+H 在部分平台 = history）。
						try { event.preventDefault?.(); } catch { /* noop */ }
						return true;
					}
					try {
						widget.openReplace?.();
						event.preventDefault?.();
					} catch { /* noop */ }
					return true;
				}
				// Escape → 若 widget 打开则关；否则不拦（交给其他 plugin，例如 slash menu）
				if (key === 'Escape' && !isCmdOrCtrl(event) && !event.shiftKey && !event.altKey) {
					try {
						if (widget.isOpen?.()) {
							widget.close?.();
							event.preventDefault?.();
							return true;
						}
					} catch { /* noop */ }
					return false;
				}
				return false;
			},
		},
	});
}
