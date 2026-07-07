// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  VSWord T-3.5c.3 · Frontmatter YAML + TOML · NodeView 折叠/展开 + textarea 编辑 + 保源码
 *
 *  设计要点（PRD 003c §8 T-3.5c.3 · F-10..F-16）：
 *   - remark-frontmatter 处理 fence 解析 + stringify（保源码由它自己保证 —— 内容不经过
 *     inline phrasing，`---` / `+++` 之间的字节原样进/原样出）
 *   - 两个独立 $nodeSchema：`frontmatter_yaml` / `frontmatter_toml`（block、atom、
 *     attrs.value 存原始内部字符串）
 *   - NodeView：folded 时渲染 `📄 <title> · N fields` 一行；点击展开 textarea；
 *     Esc 取消、Ctrl+Enter / blur commit —— 完全复用 math-view 的交互 pattern
 *   - js-yaml / @iarna/toml 验证：commit 时跑一次 parse，parse 失败仍写回原样并挂
 *     红色 error banner（F-13：不阻塞保存，只 hint）
 *   - JSON（F-16）本轮不实现（remark-frontmatter fence 语义与 JSON `{...}` 冲突，
 *     单独一轮 T-3.5c.6 补），helpers 已铺 FLAVOR 常量
 *
 *  Data path：
 *    parse:   `---\ntitle: hi\n---`
 *      --remark-frontmatter fromMarkdown-> mdast { type:'yaml', value:'title: hi' }
 *      --frontmatterYamlSchema.parseMarkdown runner--> PM node 'frontmatter_yaml' { value:'title: hi' }
 *    write:   PM node 'frontmatter_yaml' { value:'title: hi' }
 *      --frontmatterYamlSchema.toMarkdown-> mdast { type:'yaml', value:'title: hi' }
 *      --remark-frontmatter toMarkdown-> `---\ntitle: hi\n---`
 *--------------------------------------------------------------------------------------------*/

import { $nodeSchema, $remark, $view, $ctx } from '@milkdown/utils';
import remarkFrontmatter from 'remark-frontmatter';
import jsYaml from 'js-yaml';
// 只取 parse-string.js —— toml 主入口 parse.js 会 require('stream')（node 内置），
// esbuild 浏览器 bundle 装不下；这里只需要在 validate 时同步 parse 字符串。
import TOMLParse from '@iarna/toml/parse-string.js';
import {
	summarizeFrontmatter,
	formatSummaryLabel,
	detectFrontmatterError,
} from './frontmatter-helpers.mjs';

// -----------------------------------------------------------------------------
// remark 插件挂载（yaml + toml；JSON 见 F-16 备注）
// -----------------------------------------------------------------------------

export const remarkFrontmatterPlugin = $remark(
	'vsword-remark-frontmatter',
	() => remarkFrontmatter,
	['yaml', 'toml'],
);

// -----------------------------------------------------------------------------
// 注入 parser（供 helpers.detectFrontmatterError 用）
// -----------------------------------------------------------------------------

const FRONTMATTER_PARSERS = Object.freeze({
	yaml: (v) => jsYaml.load(v, { schema: jsYaml.CORE_SCHEMA }),
	toml: (v) => TOMLParse(v),
	// JSON 走 native
	json: (v) => JSON.parse(v),
});

// -----------------------------------------------------------------------------
// Schema helper factory —— YAML / TOML 只在 name / mdastType 上有别，其余全一样
// -----------------------------------------------------------------------------

function makeFrontmatterSchema(schemaName, mdastType) {
	return $nodeSchema(schemaName, () => ({
		group: 'block',
		atom: true,
		defining: true,
		isolating: true,
		attrs: {
			value: { default: '' },
		},
		parseDOM: [{
			tag: `div[data-type="${schemaName}"]`,
			getAttrs: (dom) => {
				const val = dom instanceof HTMLElement ? (dom.getAttribute('data-value') || '') : '';
				return { value: val };
			},
		}],
		toDOM: (node) => {
			const value = String(node.attrs?.value ?? '');
			return ['div', {
				'data-type': schemaName,
				'data-value': value,
				class: `vsword-frontmatter vsword-frontmatter-${mdastType}`,
			}, value];
		},
		parseMarkdown: {
			match: (n) => n.type === mdastType,
			runner: (state, node, type) => {
				state.addNode(type, { value: typeof node.value === 'string' ? node.value : '' });
			},
		},
		toMarkdown: {
			match: (n) => n.type.name === schemaName,
			runner: (state, pmNode) => {
				state.addNode(mdastType, undefined, String(pmNode.attrs?.value ?? ''));
			},
		},
	}));
}

export const frontmatterYamlSchema = makeFrontmatterSchema('frontmatter_yaml', 'yaml');
export const frontmatterTomlSchema = makeFrontmatterSchema('frontmatter_toml', 'toml');

// -----------------------------------------------------------------------------
// NodeView：折叠预览 + 展开 textarea（math-view pattern）
// -----------------------------------------------------------------------------

function createFrontmatterNodeView(flavor) {
	return (node, view, getPos) => {
		const doc = view.dom.ownerDocument;
		const dom = doc.createElement('div');
		dom.className = `vsword-frontmatter vsword-frontmatter-${flavor}`;
		dom.dataset.flavor = flavor;
		dom.setAttribute('contenteditable', 'false');

		const summary = doc.createElement('div');
		summary.className = 'vsword-frontmatter-summary';
		summary.setAttribute('role', 'button');
		summary.setAttribute('tabindex', '0');
		summary.setAttribute('aria-label', `${flavor.toUpperCase()} frontmatter · 点击编辑`);

		const editor = doc.createElement('div');
		editor.className = 'vsword-frontmatter-editor';
		editor.hidden = true;

		const textarea = doc.createElement('textarea');
		textarea.className = 'vsword-frontmatter-source';
		textarea.spellcheck = false;
		textarea.setAttribute('aria-label', `${flavor.toUpperCase()} frontmatter source`);

		const errBar = doc.createElement('div');
		errBar.className = 'vsword-frontmatter-error';
		errBar.hidden = true;

		const hint = doc.createElement('div');
		hint.className = 'vsword-frontmatter-hint';
		hint.textContent = 'Ctrl/Cmd+Enter 保存 · Esc 取消';

		editor.append(textarea, errBar, hint);
		dom.append(summary, editor);

		let editing = false;
		let current = String(node.attrs?.value ?? '');

		function renderSummary() {
			const s = summarizeFrontmatter(current, flavor);
			summary.textContent = formatSummaryLabel(s);
			summary.title = s.title || `${flavor.toUpperCase()} frontmatter`;
		}

		function validate() {
			const problem = detectFrontmatterError(textarea.value, flavor, FRONTMATTER_PARSERS);
			if (problem) {
				errBar.hidden = false;
				const col = problem.column != null ? `:${problem.column}` : '';
				errBar.textContent = `${flavor.toUpperCase()} 解析错误（第 ${problem.line}${col} 行）：${problem.message}`;
				dom.classList.add('has-error');
			} else {
				errBar.hidden = true;
				errBar.textContent = '';
				dom.classList.remove('has-error');
			}
		}

		function enterEdit() {
			if (editing) return;
			editing = true;
			editor.hidden = false;
			summary.hidden = true;
			textarea.value = current;
			const lines = Math.max(3, Math.min(24, current.split(/\r?\n/).length + 1));
			textarea.style.height = (lines * 1.5) + 'em';
			dom.classList.add('is-editing');
			validate();
			queueMicrotask(() => textarea.focus());
		}

		function commit() {
			if (!editing) return;
			editing = false;
			editor.hidden = true;
			summary.hidden = false;
			dom.classList.remove('is-editing');
			const next = textarea.value;
			if (next !== current) {
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos != null) {
					const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, value: next });
					view.dispatch(tr);
					return;   // update() 会被回调，renderSummary 在那里做
				}
			}
			renderSummary();
		}

		function cancel() {
			if (!editing) return;
			editing = false;
			editor.hidden = true;
			summary.hidden = false;
			dom.classList.remove('is-editing');
			// 回滚 textarea 到 current，不 dispatch。
			textarea.value = current;
			errBar.hidden = true;
			errBar.textContent = '';
			dom.classList.remove('has-error');
		}

		summary.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			enterEdit();
		});
		summary.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterEdit(); }
		});

		textarea.addEventListener('input', () => { validate(); });
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') { e.preventDefault(); cancel(); view.focus(); return; }
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); view.focus(); return; }
		});
		textarea.addEventListener('blur', () => { commit(); });

		renderSummary();

		return {
			dom,
			update(nextNode) {
				if (nextNode.type.name !== `frontmatter_${flavor}`) return false;
				current = String(nextNode.attrs?.value ?? '');
				if (!editing) renderSummary();
				return true;
			},
			stopEvent(event) {
				return editing && editor.contains(event.target);
			},
			ignoreMutation() { return true; },
			destroy() {
				summary.remove();
				editor.remove();
			},
			selectNode() { dom.classList.add('is-selected'); },
			deselectNode() { dom.classList.remove('is-selected'); },
		};
	};
}

export const frontmatterYamlView = $view(frontmatterYamlSchema.node, () => createFrontmatterNodeView('yaml'));
export const frontmatterTomlView = $view(frontmatterTomlSchema.node, () => createFrontmatterNodeView('toml'));

// -----------------------------------------------------------------------------
// Bundle
// -----------------------------------------------------------------------------

export const frontmatterPlugins = [
	remarkFrontmatterPlugin,
	frontmatterYamlSchema,
	frontmatterTomlSchema,
	frontmatterYamlView,
	frontmatterTomlView,
].flat();

// 供 verify.template.mjs 断言用
export { FRONTMATTER_PARSERS };
