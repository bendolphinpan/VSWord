// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown webview entry.
 *
 *  This file is bundled by build-milkdown-editor.cjs into vendor/index.js and loaded
 *  inside the CustomEditor webview. It is NOT part of the Code OSS TypeScript project —
 *  it is copied verbatim into the .tmp builder dir where Milkdown packages are installed.
 *
 *  Kept as plain JS (with @ts-nocheck) so the workspace TS build ignores it, while giving
 *  us syntax highlighting and easy edits instead of the previous embedded string literal.
 *--------------------------------------------------------------------------------------------*/

import {
	Editor,
	defaultValueCtx,
	rootCtx,
	serializerCtx,
	editorViewCtx,
	editorViewOptionsCtx,
	parserCtx,
	remarkStringifyOptionsCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm, columnResizingPlugin, remarkGFMPlugin } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism } from '@milkdown/plugin-prism';
import { math } from '@milkdown/plugin-math';
import { slash, attachSlashMenu } from './slash-menu.mjs';
import { highlightPlugins } from './highlight.mjs';
import { underlinePlugins } from './underline.mjs';
import { subSupPlugins } from './sub-sup.mjs';
import { emojiPlugins } from './emoji.mjs';
import { typoraShortcutPlugins } from './shortcuts.mjs';
import { inputRulePlugins } from './input-rules.mjs';
import { focusModePlugins } from './focus-mode.mjs';
import { createModeController } from './mode-controller.mjs';
import { createViewModeApplier } from './view-mode-editable.mjs';
// T-3.7b.d: ModeSwitchComponent 接管 #milkdown-mode-switch + #milkdown-toggle-group 的 click 派发。
import { createModeSwitchComponent } from './mode-switch.mjs';
import { extractHeadings, findEnclosingHeadingId } from './outline-extractor.mjs';
import { configureImageUpload, imageUploadPlugins, installImageUploadMessageBridge } from './image-upload.mjs';
import { imageResizePlugins } from './image-node-view.mjs';
import { remarkLiftImgHtmlPlugin } from './image-schema-override.mjs';
import { codeBlockSchemaOverride } from './code-block-schema-override.mjs';
// T-3.5c.5b: setext heading 保真后处理。
import {
	configureSetextHeading,
	postProcessSetextHeadings,
} from './setext-heading.mjs';
// T-3.5c.5b: 用一个轻量 remark-parse 解析 source 给 setext-hints 抽取位置。
// 不复用 editor 的 parser（避免引入 @milkdown 内部依赖），只跑出 mdast 节点
// + 位置偏移。
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { tableChromeView } from './table-chrome.mjs';
import { codeBlockChromePlugins, configureCodeBlockCtx } from './code-block-chrome.mjs';
import { blockHandlePlugins, configureBlockHandle, installBlockHandle } from './block-handle.mjs';
import { mathViewPlugins, configureMathKatex } from './math-view.mjs';
import { broadcastMermaidTheme } from './mermaid-view.mjs';
// T-3.5b-flow.2: flowchart-view 也需要主题广播。
import { broadcastFlowchartTheme } from './flowchart-view.mjs';
// T-3.5b-seq.2: sequence-view 也需要主题广播（虽然当前 buildSequenceOptions 恒返回 simple，
// 但保留广播链路，方便后续 dark 主题接入 / hand 主题 opt-in）。
import { broadcastSequenceTheme } from './sequence-view.mjs';
import { wikilinkPlugins, configureWikilinkHost, ingestResolutions, invalidateWikilinkCache } from './wikilink.mjs';
import {
	wikilinkAutocompletePlugins,
	configureWikilinkAutocomplete,
	ingestWikilinkIndex,
	invalidateWikilinkIndex,
} from './wikilink-autocomplete.mjs';
import {
	configureWikilinkPreview,
	ingestPreviewResponse,
	_resetWikilinkPreview,
} from './wikilink-preview.mjs';
import {
	configureWikilinkBacklinks,
	mountBacklinksFooter,
	refreshBacklinks,
	ingestBacklinks,
} from './wikilink-backlinks.mjs';
// T-3.5c.2: footnote 引用+定义+hover+跳转。
import { footnotePlugins, configureFootnoteHost } from './footnote.mjs';
import { configureFootnotePreview, _resetFootnotePreview } from './footnote-preview.mjs';
// T-3.5c.3: frontmatter YAML/TOML 折叠 NodeView 保源码。
import { frontmatterPlugins } from './frontmatter.mjs';
// T-3.7c.1.a: [TOC] 占位符 remark 层 + PM schema（NodeView 由 b 卡负责）。
import { tocRemarkPlugin } from './toc-remark.mjs';
import { tocNode } from './toc-node.mjs';
// T-3.7c.1.b: TOC NodeView + 事务级集中重算 Plugin。
import { tocViewPlugins } from './toc-view.mjs';
// T-3.7c.3.a: Find plugin（decoration 高亮）。
// T-3.7c.3.b: 真 widget + keymap 接管。widget 持有 mutable state，plugin
// 通过 widget.getFindState() 读；keymap 走 PM handleKeyDown 拦截 Ctrl+F/H/Esc。
import { $prose } from '@milkdown/utils';
import { createFindPlugin } from './find-plugin.mjs';
import { createFindWidget } from './find-widget.mjs';
import { createFindKeymap } from './find-keymap.mjs';

// 模块级 widget 实例：跨 createEditor() 重建复用。mount 只在 host 容器出现且首次
// 调用时执行；后续 editor 重建（source-mode 切换等）不重建 widget DOM，只切换绑定
// 的 EditorView。widget 内部对 view 的持有是"函数式读取"，跟 mode-controller / 
// viewModeApplier 的做法一致（entry 里 editor 变量本身也是 mutable let）。
let findWidget = null;
function getFindWidget() {
	if (findWidget) { return findWidget; }
	findWidget = createFindWidget({
		getEditorView: () => {
			try { return editor?.action(ctx => ctx.get(editorViewCtx)) || null; }
			catch { return null; }
		},
		getMode: () => (modeController?.getMode?.() || 'wysiwyg'),
	});
	return findWidget;
}

// ---- T-3.3.6: Typora-flavoured remark-stringify options ------------------------------------
// Match Typora's default output style so opening a Typora .md and re-saving through VSWord
// produces a minimal diff (dash bullets, single asterisks for em, double for strong, no
// pipe-aligned tables, ATX headings, backtick fences, one-space list indent).
const TYPORA_STRINGIFY_OPTIONS = {
	bullet: '-',
	bulletOrdered: '.',
	emphasis: '*',
	strong: '*',           // 2× applied → **strong**
	fences: true,          // ``` fences instead of indented code
	listItemIndent: 'one', // Typora uses 1-space indent for list items
	rule: '-',             // --- thematic breaks
	ruleRepetition: 3,
	ruleSpaces: false,
	tightDefinitions: true,
	resourceLink: false,
	setext: false,         // ATX headings (# H1) not underline
	incrementListMarker: true,
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
// T-3.5.1: wire the imageUpload* host messages into the pending uploader registry BEFORE
// the editor is created so no message arrives ahead of the listener.
installImageUploadMessageBridge();
const shell = document.querySelector('.vsword-md-shell');
const root = document.getElementById('milkdown-root');
const status = document.getElementById('milkdown-status');
const saveButton = document.getElementById('milkdown-save');
const sourceTextarea = document.getElementById('milkdown-source');
const modeButtons = document.querySelectorAll('#milkdown-mode-switch .vsword-md-mode-btn');
const toggleButtons = document.querySelectorAll('#milkdown-toggle-group .vsword-md-toggle-btn');

let editor;
let currentMarkdown = '';
let dirty = false;
let initialized = false;
let saveSeq = 0;
let slashController;
let blockHandleController;
let modeController;
// T-3.7b.c: 视图模式 → editable 切换器。整个 webview 一份，跨 createEditor 重建。
// createEditor 拆掉旧 Editor 时先 setSessionReady(false)，新 editor.create() 完成后再 setSessionReady(true)。
const viewModeApplier = createViewModeApplier({
	getEditor: () => editor,
	editorViewCtx,
	editorViewOptionsCtx,
	log: (msg, err) => reportError('view-mode-editable/' + msg, err),
});
// Debounce timer for source-mode textarea → host autosave (mirrors WYSIWYG behaviour).
let sourceDebounce = 0;
// T-3.4: cached outline snapshot so cursor-only moves don't rebuild the tree.
let outlineHeadings = [];
let outlineActiveId = null;

function publishOutline() {
	vscode?.postMessage({ type: 'outlineChanged', headings: outlineHeadings, activeId: outlineActiveId });
}

function refreshOutline(view) {
	if (!view) return;
	outlineHeadings = extractHeadings(view.state.doc);
	outlineActiveId = findEnclosingHeadingId(outlineHeadings, view.state.selection.from);
	publishOutline();
}

function refreshOutlineActiveOnly(view) {
	if (!view) return;
	const next = findEnclosingHeadingId(outlineHeadings, view.state.selection.from);
	if (next === outlineActiveId) return;
	outlineActiveId = next;
	publishOutline();
}

function setStatus(message, kind = 'info') {
	if (!status) return;
	status.textContent = message;
	status.dataset.kind = kind;
}

function serialize() {
	// T-3.3.2: in source mode the textarea is the source of truth.
	if (modeController?.isSourceMode()) {
		return modeController.getSourceValue();
	}
	if (!editor) return currentMarkdown;
	const raw = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
	// T-3.5c.5b: 把 ATX h1/h2 改写为 setext（与原文一致时）。后处理不可变。
	return postProcessSetextHeadings(raw);
}

function reportError(prefix, err) {
	const msg = err && err.stack ? err.stack : String(err);
	setStatus('[' + prefix + '] ' + (msg.split('\n')[0] || msg).slice(0, 240), 'error');
	vscode?.postMessage({ type: 'webviewError', prefix, message: msg });
	console.error('[vsword-milkdown]', prefix, err);
}

async function createEditor(markdown) {
	if (!root) throw new Error('Missing #milkdown-root');
	// T-3.7b.c: 旧 editor 拆掉 + 新 editor 未 create() 完毕的空档期 apply 会踩空 ctx，
	// 先关 sessionReady，等到 initialized = true 后再打开并 replay。
	viewModeApplier.setSessionReady(false);
	root.textContent = '';
	currentMarkdown = markdown;
	dirty = false;
	initialized = false;
	// T-3.5c.5b: 在创建编辑器前先把原文里的 setext heading 抽成 hint 队列。
	// 注意：必须**在 editor 加载 markdown 之前**做，避免丢失 sourceText 引用
	// （编辑器内部不会保留原文，只保留 PM doc）。
	try {
		const mdast = unified().use(remarkParse).parse(markdown);
		const blocks = [];
		for (const node of (mdast && mdast.children) || []) {
			const pos = node && node.position;
			if (!pos || !pos.start || !pos.end) { blocks.push(null); continue; }
			const from = pos.start.offset;
			const to = pos.end.offset;
			if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
				blocks.push(null); continue;
			}
			blocks.push([from, to]);
		}
		configureSetextHeading({ sourceText: markdown, blockRanges: blocks });
	} catch (err) {
		// sourceText 解析失败时禁用后处理（不阻塞主流程，setext 退化为 ATX）。
		configureSetextHeading({ sourceText: '', blockRanges: [] });
		reportError('setext-init', err);
	}
	if (editor) {
		await editor.destroy(true);
		editor = undefined;
	}
	if (slashController) {
		slashController.destroy();
		slashController = undefined;
	}
	if (blockHandleController) {
		blockHandleController.destroy();
		blockHandleController = undefined;
	}
	editor = await Editor.make()
		.config(ctx => {
			ctx.set(rootCtx, root);
			ctx.set(defaultValueCtx, markdown);
			ctx.set(remarkStringifyOptionsCtx, TYPORA_STRINGIFY_OPTIONS);
			// T-3.5c.4: 关掉 GFM strikethrough 的 singleTilde（默认 true 会把 `~x~` 也当删除线），
			// 把单波浪 `~x~` 让给 subscript 装饰族，双波浪 `~~x~~` 依旧走 GFM strike。
			ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
			configureCodeBlockCtx(ctx);
			configureBlockHandle(ctx);
			configureMathKatex(ctx);
			configureWikilinkHost(ctx, vscode);
			configureWikilinkAutocomplete({
				postToHost: (m) => { try { vscode.postMessage(m); } catch { /* ignore */ } },
			});
			configureWikilinkPreview({
				postToHost: (m) => { try { vscode.postMessage(m); } catch { /* ignore */ } },
			});
			configureWikilinkBacklinks({
				postToHost: (m) => { try { vscode.postMessage(m); } catch { /* ignore */ } },
				openBacklink: (path, newSplit) => {
					try { vscode.postMessage({ type: 'openWikilinkPath', path, newSplit }); } catch { /* ignore */ }
				},
			});
			// T-3.5c.2: footnote host + hover-preview 桥接。数据源在本 doc，
			// 不走 host RT；host 仅收 openFootnote click 用作 telemetry / future 扩展。
			configureFootnoteHost(ctx, {
				vscode,
				getView: () => { try { return ctx.get(editorViewCtx); } catch { return null; } },
			});
			configureFootnotePreview({
				getView: () => { try { return ctx.get(editorViewCtx); } catch { return null; } },
			});
			ctx.get(listenerCtx).markdownUpdated((ctxRef, nextMarkdown) => {
				currentMarkdown = nextMarkdown;
				if (!initialized) return;
				dirty = true;
				setStatus('Unsaved changes…', 'dirty');
				vscode?.postMessage({ type: 'markdownUpdated', markdown: nextMarkdown });
				// T-3.4: rebuild outline on every doc change.
				refreshOutline(ctxRef.get(editorViewCtx));
			});
			// T-3.4: cursor moves update the active heading (highlight in Outline pane).
			ctx.get(listenerCtx).selectionUpdated(ctxRef => {
				if (!initialized) return;
				refreshOutlineActiveOnly(ctxRef.get(editorViewCtx));
			});
			// Register slash view via SlashProvider once the editor context is ready.
			ctx.set(slash.key, {
				view: view => {
					slashController = attachSlashMenu(ctx, root);
					return {
						update: (v, prevState) => slashController.update(v, prevState),
						destroy: () => slashController?.destroy(),
					};
				},
			});
			// T-3.5.1: install the host-backed image uploader on top of plugin-upload's default.
			configureImageUpload(ctx, vscode);
		})
		.use(listener)
		.use(commonmark)
		// T-3.5c.5: 覆盖 commonmark 的 code_block schema，attrs 新增 `meta`，
		// 让 fence info meta（```js {highlight-lines=[1,3]}```）round-trip 保真。
		.use(codeBlockSchemaOverride)
		.use(gfm)
		.use(history)
		.use(prism)
		.use(math)
		.use(slash)
		.use(highlightPlugins)
		.use(underlinePlugins)
		.use(subSupPlugins)
		.use(emojiPlugins)
		.use(typoraShortcutPlugins)
		.use(inputRulePlugins)
		.use(focusModePlugins)
		.use(imageUploadPlugins)
		.use(remarkLiftImgHtmlPlugin)
		.use(imageResizePlugins)
		.use(tableChromeView)
		.use(columnResizingPlugin)
		.use(codeBlockChromePlugins)
		.use(blockHandlePlugins)
		.use(mathViewPlugins)
		.use(wikilinkPlugins)
		.use(wikilinkAutocompletePlugins)
		.use(footnotePlugins)
		.use(frontmatterPlugins)
		// T-3.7c.1.a: TOC remark 变换要在其他 mdast 转换器之后跑（先让 image-lift /
		// frontmatter 等消耗掉自己的目标节点），最后再来识别纯 `[TOC]` paragraph。
		.use(tocRemarkPlugin)
		.use(tocNode)
		// T-3.7c.1.b: NodeView + 事务级集中重算 Plugin。必须紧跟 tocNode（$view 依赖
		// schema 已注册）；$prose 里的 recompute plugin 走 appendTransaction，与
		// tracker plugin 一样在 milkdown 6.x prosemirror 插件链末尾生效。
		.use(tocViewPlugins)
		// T-3.7c.3.b: Find plugin 从 widget 读真源 state，keymap 拦截 Ctrl+F/H/Esc。
		// 每次 createEditor 都构造一次 plugin/keymap 实例；widget 单例（getFindWidget
		// 保证），跨 editor 重建复用 → widget DOM 不闪、mount 不重复。
		.use($prose(() => createFindPlugin(() => getFindWidget().getFindState())))
		.use($prose(() => createFindKeymap(getFindWidget(), { getMode: () => (modeController?.getMode?.() || 'wysiwyg') })))
		.create();
	currentMarkdown = serialize();
	initialized = true;
	setStatus('Ready', 'ok');
	// T-3.11.4: pin the backlinks footer to the editor container and kick off
	// the first inverse-index query. Repaints itself on host response.
	try {
		mountBacklinksFooter(root.parentElement || root);
		refreshBacklinks();
	} catch (err) {
		reportError('backlinks-mount', err);
	}
	// T-3.8: mount the hover block handle. Kept separate from `.use()` because
	// the handle DOM listens on the editor root, which only exists post-create.
	try {
		editor.action(ctx => { blockHandleController = installBlockHandle(ctx, root); });
	} catch (err) {
		reportError('block-handle-mount', err);
	}
	// T-3.4: seed the initial outline snapshot so the Outline pane fills as soon as it opens.
	try {
		editor.action(ctx => refreshOutline(ctx.get(editorViewCtx)));
	} catch (err) {
		reportError('outline-seed', err);
	}
	// T-3.7b.c: 新 editor 就绪，打开 sessionReady 闸门并把当前视图模式立即刷进 editable。
	// modeController 若已存在（重新加载场景）→ 立即 apply；首次加载它尚未构造，走 pendingMode 通道，
	// 等 modeController 首次 onModeChange / applyPersistedPreference 时补上。
	try {
		viewModeApplier.setSessionReady(true);
		const currentMode = modeController?.getMode?.();
		if (typeof currentMode === 'string' && currentMode.length > 0) {
			viewModeApplier.apply(currentMode);
		}
	} catch (err) {
		reportError('view-mode-editable/seed', err);
	}
}

// T-3.3.2: rebuild the editor from source-mode textarea content.
async function reloadEditorFromMarkdown(markdown, reason) {
	try {
		await createEditor(markdown);
		// The editor recreation resets dirty; if the user actually changed source, mark dirty.
		if (reason === 'source-exit' && markdown !== currentMarkdown) {
			dirty = true;
			setStatus('Unsaved changes…', 'dirty');
			vscode?.postMessage({ type: 'markdownUpdated', markdown });
		}
	} catch (err) {
		reportError(reason || 'reload', err);
	}
}

function requestSave() {
	const markdown = serialize();
	currentMarkdown = markdown;
	dirty = true;
	const requestId = 'manual-' + (++saveSeq);
	setStatus('Saving…', 'dirty');
	vscode?.postMessage({ type: 'save', requestId, markdown });
}

/**
 * T-3.7c.1.c · 命令 `vsword.toc.insertToc` 的 webview 实现。
 *
 * 语义（PRD §5 AC-4 + 决策 D-3/D-8）：
 *   1) 编辑器未 ready / source 模式 → no-op（避免脏 tr）；
 *   2) 光标 / 选区起点所在**顶层块**之后插入一个 toc_marker 节点；
 *      · toc_marker 是 group:'block' + atom + selectable=false（toc-node.template.js）；
 *      · 插入位置为 `$from.after(1)` —— 落在 doc 顶层，紧跟当前段落 / heading 结束边界，
 *        避免落进 list-item / blockquote 内部造成结构穿透；
 *   3) 插入后光标停在新节点之后（PM 常规约定：插入不动选区，用户体验可控）；
 *   4) 触发 dirty + markdownUpdated（save 由 host 侧 auto-save 或用户 Ctrl+S 承担）。
 *
 * 挂载点是 `editor.action`，保证在 milkdown ctx 下拿到 view / schema。
 */
function insertTocAtCursor() {
	try {
		if (modeController?.isSourceMode()) { return; }
		if (!editor) { return; }
		editor.action(ctx => {
			const view = ctx.get(editorViewCtx);
			const state = view.state;
			const schema = state.schema;
			const type = schema.nodes.toc_marker;
			if (!type) { return; }
			const $from = state.selection.$from;
			// depth 1 = 顶层块的父级；.after(1) = 该顶层块结束位置。
			const insertPos = $from.depth >= 1 ? $from.after(1) : state.doc.content.size;
			const tr = state.tr.insert(insertPos, type.create());
			view.dispatch(tr);
			// 触发 currentMarkdown 同步（listener 会随即 markdownUpdated；这里立即刷一次
			// 保证 host 侧 dirty 状态可视）。
			try {
				const md = ctx.get(serializerCtx)(view.state.doc);
				if (md !== currentMarkdown) {
					currentMarkdown = md;
					dirty = true;
					vscode?.postMessage({ type: 'markdownUpdated', markdown: md });
				}
			} catch { /* serialize 失败不阻塞插入本身 */ }
		});
	} catch (err) {
		reportError('tocInsert', err);
	}
}

/**
 * T-3.8.2 · Qa2=c 格式化整篇。
 * 语义：`parse → stringify` 得到规范化 markdown，把结果重灌进编辑器（保守起见走 reload），
 * 再触发一次 save；host 侧已在派发前 `setPendingFormatPath` 到 'C'，本次 save 强制走全文 remark。
 * 若序列化拿不到（编辑器未 ready / 处于 source 模式），退化为直接 save 当前 markdown。
 */
async function formatDocumentInPlace() {
	try {
		if (modeController?.isSourceMode()) {
			// source 模式：把 textarea 里的原文 parse→stringify（借 milkdown 一次性容器）。
			// 这里保守起见：直接把 textarea 值当 markdown 触发 save；host 侧 forcePath='C'
			// 保证走 C 分支写盘。
			const md = sourceTextarea?.value ?? currentMarkdown;
			currentMarkdown = md;
			vscode?.postMessage({ type: 'markdownUpdated', markdown: md });
			vscode?.postMessage({ type: 'save', requestId: 'format-' + (++saveSeq), markdown: md });
			setStatus('Formatting…', 'dirty');
			return;
		}
		if (!editor) {
			vscode?.postMessage({ type: 'save', requestId: 'format-' + (++saveSeq), markdown: currentMarkdown });
			return;
		}
		// parse → stringify：serialize() 已经等价于 stringify(currentDoc)。为了确保是「重排」
		// 而不是"读回内存里未提交的编辑"，我们先 serialize 得到规范化 markdown，然后与
		// 当前 currentMarkdown 比较；若变化则触发 reload 重新走 parse。
		const normalized = editor.action(ctx => {
			const view = ctx.get(editorViewCtx);
			const md = ctx.get(serializerCtx)(view.state.doc);
			return postProcessSetextHeadings(md);
		});
		if (normalized !== currentMarkdown) {
			currentMarkdown = normalized;
			dirty = true;
			setStatus('Formatting…', 'dirty');
			vscode?.postMessage({ type: 'markdownUpdated', markdown: normalized });
		}
		vscode?.postMessage({ type: 'save', requestId: 'format-' + (++saveSeq), markdown: normalized ?? currentMarkdown });
	} catch (err) {
		reportError('formatDocument', err);
	}
}

/**
 * T-3.8.2 · Qa2=c 格式化选区。
 * PRD 决策 Qd3=a: 选区未跨完整 top-level block 时 no-op。当前 T-3.8.2 阶段 tracker 尚未挂载，
 * 无法在 webview 内可靠识别 block 边界；先复用 formatDocumentInPlace()，host 侧 forcePath='B'
 * 在 session 不安全时会自动降级到 C。tracker mount 上线后（后续 T）再补严格 block 对齐逻辑。
 */
async function formatSelectionInPlace() {
	await formatDocumentInPlace();
}

saveButton?.addEventListener('click', () => requestSave());

// T-3.3.2: source textarea autosave (debounced, mirrors WYSIWYG listenerCtx behaviour).
sourceTextarea?.addEventListener('input', () => {
	if (!modeController?.isSourceMode()) return;
	dirty = true;
	setStatus('Unsaved changes…', 'dirty');
	if (sourceDebounce) clearTimeout(sourceDebounce);
	sourceDebounce = setTimeout(() => {
		const md = sourceTextarea.value;
		currentMarkdown = md;
		vscode?.postMessage({ type: 'markdownUpdated', markdown: md });
	}, 300);
});

// Slash-menu keyboard interception: capturing so we win before ProseMirror's own bindings.
// The controller only claims a key when the menu is actually open.
document.addEventListener('keydown', event => {
	if (slashController?.onKey?.(event)) {
		event.preventDefault();
		event.stopPropagation();
	}
}, true);
window.addEventListener('keydown', event => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
		event.preventDefault();
		requestSave();
	}
});
window.addEventListener('error', e => reportError('uncaught', e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));

window.addEventListener('message', event => {
	const msg = event.data;
	if (!msg || typeof msg.type !== 'string') return;
	if (msg.type === 'init') {
		createEditor(String(msg.markdown ?? '')).catch(err => reportError('init', err));
		// Ask the host for the persisted mode preference; the response fires modeController.applyPersistedMode.
		vscode?.postMessage({ type: 'preferenceRequest' });
		// T-3.3.1: ask the host for the effective theme so we can paint before first user action.
		vscode?.postMessage({ type: 'themeRequest' });
		return;
	}
	if (msg.type === 'reload') {
		createEditor(String(msg.markdown ?? '')).catch(err => reportError('reload', err));
		// If we're currently in source mode, sync textarea too.
		if (modeController?.isSourceMode() && sourceTextarea) {
			sourceTextarea.value = String(msg.markdown ?? '');
		}
		return;
	}
	if (msg.type === 'dirtyChanged') {
		dirty = !!msg.dirty;
		setStatus(dirty ? 'Unsaved changes…' : 'Ready', dirty ? 'dirty' : 'ok');
		return;
	}
	if (msg.type === 'saved') {
		if (msg.ok) {
			dirty = false;
			setStatus('Saved', 'ok');
		} else {
			dirty = true;
			setStatus('Save failed: ' + String(msg.message || 'unknown error').slice(0, 180), 'error');
		}
		return;
	}
	if (msg.type === 'preferenceResponse') {
		// Backward compatible: older hosts only send `mode`, newer ones may include focus/typewriter.
		modeController?.applyPersistedPreference({
			mode: msg.mode,
			focus: msg.focus,
			typewriter: msg.typewriter,
		});
		return;
	}
	if (msg.type === 'wikilinkResolveResponse') {
		// T-3.11.1: host answered one or more resolve requests. `results` is an array
		// of { target, status, file? } entries; ingest & repaint every live NodeView.
		ingestResolutions(msg.results);
		return;
	}
	if (msg.type === 'wikilinkIndexResponse') {
		// T-3.11.2: full workspace file index for the autocomplete popover.
		ingestWikilinkIndex(msg.entries);
		return;
	}
	if (msg.type === 'wikilinkPreviewResponse') {
		// T-3.11.3: host answered a hover-preview request.
		ingestPreviewResponse(msg);
		return;
	}
	if (msg.type === 'wikilinkBacklinksResponse') {
		// T-3.11.4: host answered a backlinks request.
		ingestBacklinks(msg);
		return;
	}
	if (msg.type === 'workspaceIndexChanged') {
		// T-3.11.1/.2/.3/.4: host tells us a .md was added/removed/renamed — flush all wiki-link caches.
		invalidateWikilinkCache();
		invalidateWikilinkIndex();
		_resetWikilinkPreview();
		refreshBacklinks();
		return;
	}
	if (msg.type === 'themeChanged') {
		// T-3.3.1: set body[data-theme] so the CSS layer swaps tokens. `default` = drop the attr.
		const theme = String(msg.theme || 'default');
		if (theme === 'default' || theme === '') {
			document.body.removeAttribute('data-theme');
		} else {
			document.body.setAttribute('data-theme', theme);
		}
		// T-3.5b.2: 转发 isDark 给 mermaid-view，触发所有活着的 mermaid 图表 re-render。
		// 兼容旧版 host（缺 isDark 字段）：从 data-theme 名字 fallback 判断。
		let isDark;
		if (typeof msg.isDark === 'boolean') {
			isDark = msg.isDark;
		} else {
			isDark = theme === 'night';
		}
		try { broadcastMermaidTheme(isDark); } catch (err) { reportError('mermaid-theme', err); }
		// T-3.5b-flow.2: 同款转发给 flowchart-view。
		try { broadcastFlowchartTheme(isDark); } catch (err) { reportError('flowchart-theme', err); }
		// T-3.5b-seq.2: 同款转发给 sequence-view（当前 simple 主题下无实际变化，链路预留）。
		try { broadcastSequenceTheme(isDark); } catch (err) { reportError('sequence-theme', err); }
		return;
	}
	if (msg.type === 'hostError') {
		setStatus('Host error: ' + String(msg.message || 'unknown error').slice(0, 180), 'error');
		return;
	}
	if (msg.type === 'formatDocument') {
		// T-3.8.2 · Qa2=c 整篇格式化：host 已把 workingCopy._pendingForcePath 设为 'C'。
		formatDocumentInPlace().catch(err => reportError('formatDocument', err));
		return;
	}
	if (msg.type === 'formatSelection') {
		// T-3.8.2 · Qa2=c 选区格式化：host 已把 workingCopy._pendingForcePath 设为 'B'；
		// 当前 webview 侧尚未挂 tracker，先与整篇同路径，session 不安全时 host 自动降级 C。
		formatSelectionInPlace().catch(err => reportError('formatSelection', err));
		return;
	}
	if (msg.type === 'tocInsert') {
		// T-3.7c.1.c · 命令 `vsword.toc.insertToc`：在光标所在顶层块后插入 toc_marker。
		insertTocAtCursor();
		return;
	}
	if (msg.type === 'revealHeading') {
		// T-3.4: user clicked a heading in the Outline pane. Move selection + scroll into view.
		const pos = Number(msg.pos);
		if (!editor || !Number.isFinite(pos)) return;
		try {
			editor.action(ctx => {
				const view = ctx.get(editorViewCtx);
				const doc = view.state.doc;
				const safePos = Math.max(0, Math.min(pos, doc.content.size));
				const tr = view.state.tr.setSelection(
					view.state.selection.constructor.near(doc.resolve(safePos))
				).scrollIntoView();
				view.dispatch(tr);
				view.focus();
			});
		} catch (err) {
			reportError('revealHeading', err);
		}
	}
});

// T-3.3.2: create mode controller after DOM handles are grabbed. It owns Ctrl+/ and button clicks.
// T-3.7b.d: click 派发下沉到 ModeSwitchComponent（wireButtons:false）；controller 仍持有状态机 +
// aria-pressed 更新（applyDom → buttons） + keybinding，行为等价。
modeController = createModeController({
	shell,
	buttons: modeButtons,
	toggleButtons,
	wireButtons: false,
	sourceTextarea,
	getMarkdown: () => serialize(),
	setMarkdown: (md, reason) => reloadEditorFromMarkdown(md, reason),
	vscode,
	// T-3.7b.c: 视图模式切换唯一 hook——host preferenceResponse 和 webview 快捷键都走 switchTo，
	// switchTo 最后一步触发 onModeChange，applier 在这里把 editable 切成 () => next !== 'reading'。
	onModeChange: (next) => {
		try {
			viewModeApplier.apply(next);
		} catch (err) {
			reportError('view-mode-editable/onModeChange', err);
		}
	},
});

// T-3.7b.d: mount ModeSwitchComponent —— click 派发交给 component，
// 语义调用回 controller.switchTo / setFocus / setTypewriter，保持行为等价。
const modeSwitchComponent = createModeSwitchComponent({
	onSetMode: (m) => { try { modeController?.switchTo(m); } catch (err) { reportError('mode-switch/setMode', err); } },
	onToggleFocus: () => {
		try {
			if (modeController?.getMode() === 'source') return;
			modeController?.setFocus(!modeController.isFocusOn());
		} catch (err) { reportError('mode-switch/toggleFocus', err); }
	},
	onToggleTypewriter: () => {
		try {
			if (modeController?.getMode() === 'source') return;
			modeController?.setTypewriter(!modeController.isTypewriterOn());
		} catch (err) { reportError('mode-switch/toggleTypewriter', err); }
	},
	getState: () => ({
		mode: modeController?.getMode() || 'realtime',
		focus: !!modeController?.isFocusOn(),
		typewriter: !!modeController?.isTypewriterOn(),
	}),
});
if (shell) modeSwitchComponent.mount(shell);

// T-3.7c.3.b: mount FindWidget 到 shell 顶部。widget 单例（getFindWidget 保
// 证），mount 之后开关状态由 open()/close() 切 `.vsword-hidden` class 管理，
// DOM 常驻不重建。若 shell 未就绪（极端 host 布局），widget 保持未挂载 —— 
// Ctrl+F keymap 会在 open() 里因 el===null 静默 no-op，符合 D-2 悬浮语义。
if (shell) {
	try { getFindWidget().mount(shell); }
	catch (err) { reportError('find-widget/mount', err); }
}

vscode?.postMessage({ type: 'ready' });
window.__vswordMilkdown = {
	getMarkdown: serialize,
	isDirty: () => dirty,
	getMode: () => modeController?.getMode(),
	switchMode: m => modeController?.switchTo(m),
	isFocusOn: () => modeController?.isFocusOn(),
	isTypewriterOn: () => modeController?.isTypewriterOn(),
	setFocus: on => modeController?.setFocus(on),
	setTypewriter: on => modeController?.setTypewriter(on),
};
