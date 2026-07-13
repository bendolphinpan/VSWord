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
// T-3.12.1.b: IME composition 状态机 + host 上报桥。事件挂在 #milkdown-root
// 冒泡链路上（预算自救 fallback：不动 editorViewOptionsCtx，避免与
// view-mode-editable 的 slice update 打架）。state 机做兜底 flush，防止
// 未来 auto-save 通路走到 requestAutoSave() 时被 host gate 永久推迟。
import { createImeCompositionState } from './ime-composition-state.mjs';
// T-3.7b.d + T-3.12.3.b: ModeSwitchComponent 接管 #milkdown-mode-switch + #milkdown-substyle-group 的 click 派发。
import { createModeSwitchComponent } from './mode-switch.mjs';
import { extractHeadings, findEnclosingHeadingId } from './outline-extractor.mjs';
import { configureImageUpload, imageUploadPlugins, installImageUploadMessageBridge } from './image-upload.mjs';
import { imageResizePlugins } from './image-node-view.mjs';
import { remarkLiftImgHtmlPlugin } from './image-schema-override.mjs';
import { codeBlockSchemaOverride } from './code-block-schema-override.mjs';
// T-3.5c.5b: setext heading 保真后处理。
import {
	configureSetextHeadingFromSource,
	postProcessSetextHeadings,
} from './setext-heading.mjs';
// RD-1: setext hints 改 O(N) 行扫描（setext-helpers.scanSetextHintsFromSource），
// 不再在 createEditor 前 unified+remark-parse 整篇（与 Milkdown GFM parse 双倍开销）。
// RD-1.2: 大文档 progressive 分块（table/GFM 超线性 → 首屏可编辑）。
import {
	shouldUseProgressiveOpen,
	splitMarkdownProgressive,
	VSWORD_FIRST_CHUNK_CHARS,
	VSWORD_NEXT_CHUNK_CHARS,
} from './markdown-chunk.mjs';
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
		// T-3.7c.3.c2 · state 变化上报 host。widget 每次 open/close/输入/选项/上下/替换后
		// 折成 host FindState 增量字段发一条 'find.stateChanged'；host 侧 IVSWordFindService
		// 会 fold 进当前镜像并 fire onDidChangeState 供命令面板 / UI 消费。
		onStateChanged: (partial) => {
			try { vscode?.postMessage({ type: 'find.stateChanged', ...partial }); }
			catch { /* webview disposed */ }
		},
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
// T-3.12.3.b: 二级 substyle radiogroup (normal | focus | typewriter, 三选一互斥).
// T-3.13.2: 阅读模式下 substyle-group 保留在 DOM 内, NodeList 快照跨 mode 恒定;
// controller 里所有对 substyleButtons 的 forEach 均正常工作.
const substyleButtons = document.querySelectorAll('#milkdown-substyle-group .vsword-md-substyle-btn');

let editor;
let currentMarkdown = '';
let dirty = false;
let initialized = false;
let saveSeq = 0;
let slashController;
let blockHandleController;
let modeController;
// RD-1.2/1.3/1.4: progressive 按需加载（默认只装首屏，滚动近底再追加，不全量灌 PM）。
let progressiveLoading = false;
let progressiveEpoch = 0;
let progressiveUserEdited = false;
/** true 仅在 appendMarkdownChunk 内部，用于区分「后台追加 tr」与「用户键入」。 */
let progressiveAppending = false;
/** 尚未装入 PM 的原文尾部 chunks（join 可还原未加载尾）。 */
let pendingChunks = /** @type {string[]} */([]);
/** 总块数 / 已装块数（含首屏）。 */
let progressiveTotalChunks = 0;
let progressiveLoadedChunks = 0;
/** 打开时的完整原文（未改时 getFullMarkdown 可直接返回）。 */
let progressiveOriginalMarkdown = '';
let progressiveScrollBound = false;
let progressiveLoadMoreBusy = false;
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

function serializePmOnly() {
	if (!editor) return currentMarkdown;
	const raw = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
	// T-3.5c.5b: 把 ATX h1/h2 改写为 setext（与原文一致时）。后处理不可变。
	return postProcessSetextHeadings(raw);
}

/**
 * 对外序列化：若仍有未加载 tail，拼上 pending 原文；
 * 用户尚未改动已加载部分时优先返回打开时的完整原文（保真）。
 */
function serialize() {
	// T-3.3.2: in source mode the textarea is the source of truth.
	if (modeController?.isSourceMode()) {
		return modeController.getSourceValue();
	}
	if (!editor) return currentMarkdown;
	if (pendingChunks.length === 0) {
		return serializePmOnly();
	}
	// 未加载完：无用户编辑 → 完整原文；有编辑 → PM 已加载部分 + 原文尾
	if (!progressiveUserEdited && progressiveOriginalMarkdown) {
		return progressiveOriginalMarkdown;
	}
	return serializePmOnly() + pendingChunks.join('');
}

function reportError(prefix, err) {
	const msg = err && err.stack ? err.stack : String(err);
	setStatus('[' + prefix + '] ' + (msg.split('\n')[0] || msg).slice(0, 240), 'error');
	vscode?.postMessage({ type: 'webviewError', prefix, message: msg });
	console.error('[vsword-milkdown]', prefix, err);
}

function yieldToMain() {
	return new Promise(resolve => {
		const go = () => {
			// RD-1.3：composition 中不追加块，避免 IME 候选被 tr.insert 打断
			try {
				if (imeCompositionState?.snapshot?.()?.composing) {
					setTimeout(go, 48);
					return;
				}
			} catch { /* ignore */ }
			resolve();
		};
		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(() => go(), { timeout: 64 });
		} else if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(() => setTimeout(go, 0));
		} else {
			setTimeout(go, 0);
		}
	});
}

/**
 * RD-1.3 · progressive 进度上报（host 可写日志 / 状态栏；webview 工具栏已有中文 status）。
 * @param {'first'|'append'|'done'} phase
 * @param {number} loadedChunks
 * @param {number} totalChunks
 * @param {number} sourceChars
 */
function postOpenProgress(phase, loadedChunks, totalChunks, sourceChars) {
	try {
		vscode?.postMessage({
			type: 'openProgress',
			progressive: totalChunks > 1,
			phase,
			loadedChunks,
			totalChunks,
			sourceChars,
		});
	} catch { /* disposed */ }
}

/**
 * RD-1.2 · 把一段 markdown 解析后追加到当前 PM doc 末尾。
 * @param {string} chunk
 */
async function appendMarkdownChunk(chunk) {
	if (!editor || typeof chunk !== 'string' || chunk.length === 0) { return; }
	progressiveAppending = true;
	try {
		await editor.action(ctx => {
			const parser = ctx.get(parserCtx);
			const view = ctx.get(editorViewCtx);
			if (!parser || !view) { return; }
			let parsed;
			try {
				parsed = parser(chunk);
			} catch (err) {
				reportError('progressive-parse', err);
				return;
			}
			if (!parsed || !parsed.content || parsed.content.size === 0) { return; }
			const end = view.state.doc.content.size;
			// 保留选区，避免追加时把用户光标拽到文末
			const tr = view.state.tr.insert(end, parsed.content);
			view.dispatch(tr);
		});
	} finally {
		progressiveAppending = false;
	}
}

function updateProgressiveStatus() {
	if (pendingChunks.length === 0) {
		if (progressiveUserEdited || dirty) {
			setStatus('Unsaved changes…', 'dirty');
		} else {
			setStatus('Ready', 'ok');
		}
		return;
	}
	setStatus(
		'已加载 ' + progressiveLoadedChunks + '/' + progressiveTotalChunks
		+ ' 段 · 下滚加载更多（未全量，保流畅）',
		'dirty',
	);
}

/**
 * RD-1.4 · 按需加载下一块（滚动近底 / 显式请求）。
 * @param {number} epoch
 */
async function loadNextProgressiveChunk(epoch) {
	if (epoch !== progressiveEpoch) return;
	if (progressiveLoadMoreBusy) return;
	if (!pendingChunks.length || !editor) return;
	progressiveLoadMoreBusy = true;
	try {
		await yieldToMain();
		if (epoch !== progressiveEpoch || !editor) return;
		const next = pendingChunks.shift();
		if (typeof next !== 'string') return;
		try {
			await appendMarkdownChunk(next);
		} catch (err) {
			reportError('progressive-append', err);
			// 失败时把 chunk 塞回，避免丢文
			pendingChunks.unshift(next);
			return;
		}
		progressiveLoadedChunks = progressiveTotalChunks - pendingChunks.length;
		postOpenProgress(
			pendingChunks.length ? 'append' : 'done',
			progressiveLoadedChunks,
			progressiveTotalChunks,
			progressiveOriginalMarkdown.length,
		);
		// 每装一块都刷新 Outline（基于当前已加载 PM，避免左侧一直空）
		try {
			editor.action(ctx => refreshOutline(ctx.get(editorViewCtx)));
		} catch (err) {
			reportError('outline-progressive', err);
		}
		if (pendingChunks.length === 0) {
			progressiveLoading = false;
			// 全量已进 PM：以 serialize 为准
			try {
				currentMarkdown = serializePmOnly();
			} catch (err) {
				reportError('progressive-serialize', err);
			}
			if (progressiveUserEdited) {
				dirty = true;
				try {
					vscode?.postMessage({ type: 'markdownUpdated', markdown: currentMarkdown });
				} catch { /* ignore */ }
			} else {
				dirty = false;
			}
		} else {
			// 仍有 tail：currentMarkdown 继续用 serialize() 拼装逻辑
			currentMarkdown = serialize();
		}
		updateProgressiveStatus();
	} finally {
		progressiveLoadMoreBusy = false;
	}
}

/**
 * 绑定 #milkdown-root 滚动：接近底部时再装下一块（不全量预取）。
 * 监听器只挂一次；用 progressiveEpoch 丢弃过期回调。
 * @param {number} epoch
 */
function bindProgressiveScroll(epoch) {
	if (!root) return;
	if (!progressiveScrollBound) {
		root.addEventListener('scroll', () => {
			if (!pendingChunks.length) return;
			const scroller = root;
			if (!scroller) return;
			const remain = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
			// 距底 < 约 2 屏时预取下一块
			if (remain < Math.max(480, scroller.clientHeight * 1.5)) {
				void loadNextProgressiveChunk(progressiveEpoch);
			}
		}, { passive: true });
		progressiveScrollBound = true;
	}
	// 若首屏很短填不满视口，立即再装几块直到能滚或装完（上限 8，避免卡死）
	const fillViewport = async () => {
		let guard = 0;
		while (
			epoch === progressiveEpoch
			&& pendingChunks.length
			&& root
			&& root.scrollHeight <= root.clientHeight + 80
			&& guard < 8
		) {
			guard++;
			await loadNextProgressiveChunk(epoch);
		}
	};
	void fillViewport();
}

/**
 * 挂载后公共收尾（outline / backlinks / handle / view-mode）。
 * @param {{ seedOutline?: boolean }} [opts]
 */
function finishEditorMount(opts) {
	const seedOutline = !opts || opts.seedOutline !== false;
	try {
		mountBacklinksFooter(root.parentElement || root);
		refreshBacklinks();
	} catch (err) {
		reportError('backlinks-mount', err);
	}
	try {
		editor.action(ctx => { blockHandleController = installBlockHandle(ctx, root); });
	} catch (err) {
		reportError('block-handle-mount', err);
	}
	if (seedOutline) {
		try {
			editor.action(ctx => refreshOutline(ctx.get(editorViewCtx)));
		} catch (err) {
			reportError('outline-seed', err);
		}
	}
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

async function createEditor(markdown) {
	if (!root) throw new Error('Missing #milkdown-root');
	// 取消进行中的 progressive 追加 / 按需加载（epoch 使旧 scroll 回调失效）
	const myEpoch = ++progressiveEpoch;
	progressiveLoading = false;
	pendingChunks = [];
	progressiveLoadMoreBusy = false;
	// T-3.7b.c: 旧 editor 拆掉 + 新 editor 未 create() 完毕的空档期 apply 会踩空 ctx，
	// 先关 sessionReady，等到 initialized = true 后再打开并 replay。
	viewModeApplier.setSessionReady(false);
	root.textContent = '';
	currentMarkdown = markdown;
	dirty = false;
	initialized = false;
	// T-3.5c.5b + RD-1: 在创建编辑器前抽 setext hint（O(N) 扫描，无 remark-parse）。
	// 必须在 editor 加载 markdown 之前：编辑器内部不保留原文，只保留 PM doc。
	try {
		configureSetextHeadingFromSource(markdown);
	} catch (err) {
		configureSetextHeadingFromSource('');
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

	// RD-1.4: 大文档 progressive —— **只装首屏**；其余 pending，滚动近底再装（不全量灌 PM）。
	const useProgressive = shouldUseProgressiveOpen(markdown);
	const chunks = useProgressive
		? splitMarkdownProgressive(markdown, VSWORD_FIRST_CHUNK_CHARS, VSWORD_NEXT_CHUNK_CHARS)
		: [markdown];
	const head = chunks[0] ?? '';
	progressiveUserEdited = false;
	progressiveAppending = false;
	progressiveLoadMoreBusy = false;
	progressiveOriginalMarkdown = markdown;
	progressiveTotalChunks = chunks.length;
	progressiveLoadedChunks = 1;
	pendingChunks = useProgressive && chunks.length > 1 ? chunks.slice(1) : [];
	if (pendingChunks.length > 0) {
		progressiveLoading = true;
		setStatus('已加载 1/' + chunks.length + ' 段 · 下滚加载更多（未全量，保流畅）', 'dirty');
	}

	editor = await Editor.make()
		.config(ctx => {
			ctx.set(rootCtx, root);
			ctx.set(defaultValueCtx, head);
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
				// 未 initialized：忽略
				if (!initialized) { return; }
				// RD-1.3/1.4：仍有 pending 或 progressive 标志
				//   · progressiveAppending=true → 后台 append 的 tr，不 dirty，只刷大纲
				//   · 否则 → 用户键入
				if (progressiveLoading || pendingChunks.length > 0) {
					if (progressiveAppending) {
						// PM-only nextMarkdown 不含 tail；用 serialize() 拼装
						currentMarkdown = serialize();
						try { refreshOutline(ctxRef.get(editorViewCtx)); } catch { /* ignore */ }
						return;
					}
					progressiveUserEdited = true;
					currentMarkdown = serialize();
					try { refreshOutline(ctxRef.get(editorViewCtx)); } catch { /* ignore */ }
					dirty = true;
					setStatus('Unsaved changes…', 'dirty');
					try {
						vscode?.postMessage({ type: 'markdownUpdated', markdown: currentMarkdown });
					} catch { /* ignore */ }
					return;
				}
				currentMarkdown = nextMarkdown;
				dirty = true;
				setStatus('Unsaved changes…', 'dirty');
				vscode?.postMessage({ type: 'markdownUpdated', markdown: nextMarkdown });
				// T-3.4: rebuild outline on every doc change.
				refreshOutline(ctxRef.get(editorViewCtx));
			});
			// T-3.4: cursor moves update the active heading（progressive 未全量时也要更新高亮）
			ctx.get(listenerCtx).selectionUpdated(ctxRef => {
				if (!initialized) { return; }
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

	// 首屏就绪：允许编辑；**始终**用已加载 PM 刷 Outline（大文档未全量时也要有目录）
	initialized = true;
	currentMarkdown = markdown;
	finishEditorMount({ seedOutline: true });

	if (pendingChunks.length === 0) {
		progressiveLoading = false;
		try {
			currentMarkdown = serializePmOnly();
		} catch {
			currentMarkdown = markdown;
		}
		postOpenProgress('done', 1, 1, markdown.length);
		setStatus('Ready', 'ok');
		return;
	}

	postOpenProgress('first', 1, progressiveTotalChunks, markdown.length);
	// 滚动按需加载（不再 for 循环灌满）
	bindProgressiveScroll(myEpoch);
	updateProgressiveStatus();
	// 双 rAF 再刷一次 outline，避免首帧 host Outline 面板尚未订阅
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (myEpoch !== progressiveEpoch || !editor) return;
				try {
					editor.action(ctx => refreshOutline(ctx.get(editorViewCtx)));
				} catch (err) {
					reportError('outline-first-raf', err);
				}
			});
		});
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
	if (msg.type === 'themeCssPayload') {
		// T-3.7d.2.c · 外挂主题 CSS 到位：把 cssText 挂到 <style id="vsword-external-theme"> 上，
		// data-theme-id 记录当前生效外挂 id 便于调试。随后的 themeChanged 会通过 body[data-theme]
		// 切换让本段 scope（`body[data-theme="ext:*"] { ... }`）生效。
		try {
			let styleEl = document.getElementById('vsword-external-theme');
			if (!styleEl) {
				styleEl = document.createElement('style');
				styleEl.id = 'vsword-external-theme';
				document.head.appendChild(styleEl);
			}
			styleEl.setAttribute('data-theme-id', String(msg.themeId || ''));
			styleEl.textContent = String(msg.cssText || '');
		} catch (err) {
			reportError('themeCssPayload', err);
		}
		return;
	}
	if (msg.type === 'typographyChanged') {
		// RD-7 · 用户字体三元组：写到 #milkdown-root 的 CSS 变量，覆盖主题 token。
		// 空 / 0 = removeProperty，回退主题默认。
		try {
			const el = document.getElementById('milkdown-root') || document.body;
			const family = typeof msg.fontFamily === 'string' ? msg.fontFamily.trim() : '';
			const size = typeof msg.fontSize === 'number' ? msg.fontSize : 0;
			const lh = typeof msg.lineHeight === 'number' ? msg.lineHeight : 0;
			if (family) { el.style.setProperty('--vsword-body-font', family); }
			else { el.style.removeProperty('--vsword-body-font'); }
			if (size > 0) { el.style.setProperty('--vsword-body-size', size + 'px'); }
			else { el.style.removeProperty('--vsword-body-size'); }
			if (lh > 0) { el.style.setProperty('--vsword-body-line', String(lh)); }
			else { el.style.removeProperty('--vsword-body-line'); }
			// 源码模式 textarea 同步字号/行高（字体可选）
			if (sourceTextarea) {
				if (family) { sourceTextarea.style.fontFamily = family; }
				else { sourceTextarea.style.fontFamily = ''; }
				if (size > 0) { sourceTextarea.style.fontSize = size + 'px'; }
				else { sourceTextarea.style.fontSize = ''; }
				if (lh > 0) { sourceTextarea.style.lineHeight = String(lh); }
				else { sourceTextarea.style.lineHeight = ''; }
			}
		} catch (err) {
			reportError('typographyChanged', err);
		}
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
		// T-3.7d.2.c · 切换到非 ext:* 主题（含 default）时，清空外挂 <style> 内容，
		// 避免旧外挂主题的 scope 规则残留匹配 body[data-theme="ext:*"]（虽已不匹配）
		// 或未来 ext scope 内滥用 :root 时污染其他主题。幂等清空。
		if (!theme.startsWith('ext:')) {
			const styleEl = document.getElementById('vsword-external-theme');
			if (styleEl) {
				styleEl.textContent = '';
				styleEl.removeAttribute('data-theme-id');
			}
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
	if (msg.type === 'find.open') {
		// T-3.7c.3.c2 · 命令面板 → host command → 请求打开 find widget（不展开替换栏）。
		try { getFindWidget().open(); } catch (err) { reportError('find.open', err); }
		return;
	}
	if (msg.type === 'find.replace.open') {
		// T-3.7c.3.c2 · 命令面板 → host command → 请求打开 find widget 并展开替换栏。
		try { getFindWidget().openReplace(); } catch (err) { reportError('find.replace.open', err); }
		return;
	}
	if (msg.type === 'find.close') {
		// T-3.7c.3.c2 · 命令面板 → host command → 请求关闭 find widget。
		try { getFindWidget().close(); } catch (err) { reportError('find.close', err); }
		return;
	}
	if (msg.type === 'export.html.request') {
		// T-3.8b.1.c · host 侧 `vsword.export.html` 命令请求 HTML snapshot。
		// 本卡窄化：webview 只做「DOM 提取 + CSS 收集」，不做本地图片抓取（TODO T-3.8b.1.d）。
		// assemble 由 host 侧 `assembleExportHtml` 完成（避免 webview bundle 依赖 host 模块）。
		try {
			const requestId = String(msg.requestId || '');
			const imageMode = msg.imageMode === 'sibling-folder' ? 'sibling-folder' : 'data-uri';
			const rootEl = document.getElementById('milkdown-root');
			// ProseMirror 容器优先；找不到就退回 root innerHTML（极端 case）。
			const proseEl = rootEl?.querySelector('.ProseMirror') || rootEl;
			const bodyInnerHtml = proseEl ? proseEl.innerHTML : '';
			// 收集所有 <style> —— milkdownEditorHtml.ts 里的样式 + 外挂主题 style（若存在）
			// 全部合并成 themeCss；host 侧 assemble 会拼进 <head><style>...</style>。
			let themeCss = '';
			try {
				const styleEls = document.querySelectorAll('style');
				const chunks = [];
				for (const el of styleEls) {
					// 跳过内容为空的占位 style。
					const txt = el.textContent || '';
					if (txt.trim().length > 0) chunks.push(txt);
				}
				themeCss = chunks.join('\n');
			} catch (err) {
				reportError('export.themeCss', err);
			}
			// Prism CSS —— 本 webview 里 prism token 颜色是通过 milkdownEditorHtml.ts 的
			// `#milkdown-root .ProseMirror .token.*` 段一并注入的，已经被 themeCss 收集了。
			// 单独字段留空 + TODO 让 T-3.8b.1.d 若拆分独立文件时再填。
			const prismCss = '';
			const themeId = document.body.getAttribute('data-theme') || 'default';
			// 本卡不做本地图片抓取，assets 恒空数组，通路先跑通（TODO T-3.8b.1.d）。
			const assets = imageMode === 'sibling-folder' ? [] : undefined;
			vscode?.postMessage({
				type: 'export.html.response',
				requestId,
				bodyInnerHtml,
				themeCss,
				prismCss,
				themeId,
				assets,
			});
		} catch (err) {
			reportError('export.html.request', err);
			vscode?.postMessage({
				type: 'export.html.response',
				requestId: String(msg.requestId || ''),
				error: err instanceof Error ? err.message : String(err),
			});
		}
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
// T-3.12.3.b: onModeChange 里额外调 modeSwitchComponent.applyModeVisibility(next),
// 让 component 决定 #milkdown-substyle-group 的 DOM detach/re-attach (reading 下 detach).
// forward-declare 是因为 component 在 controller 之后 mount, onModeChange 触发时
// (首次 switchTo / preferenceResponse) component 已就位.
let modeSwitchComponent = null;
modeController = createModeController({
	shell,
	buttons: modeButtons,
	substyleButtons,
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
		// T-3.12.3.b: reading ↔ realtime/source 切换时同步二级 substyle-group 可见性
		// (DOM 整块 detach/re-attach). component 内部幂等, 反复调也无副作用.
		try {
			modeSwitchComponent?.applyModeVisibility(next);
		} catch (err) {
			reportError('mode-switch/applyModeVisibility', err);
		}
	},
});

// T-3.7b.d + T-3.12.3.b: mount ModeSwitchComponent —— click 派发交给 component,
// 一级 mode 走 controller.switchTo, 二级 substyle radio 走 controller.setSubstyle
// (radio 语义: 二次点已选项无副作用, setSubstyle 内部 next === substyle 短路).
modeSwitchComponent = createModeSwitchComponent({
	onSetMode: (m) => { try { modeController?.switchTo(m); } catch (err) { reportError('mode-switch/setMode', err); } },
	onSetSubstyle: (s) => {
		try {
			// T-3.13.2: reading × substyle 三选一恢复, 不再拦截 reading 下的 setSubstyle;
			// reading × normal / focus / typewriter 三档均生效 (dim / typewriter re-scroll 由 CSS + focus-mode plugin 分别渲染).
			modeController?.setSubstyle(s);
		} catch (err) { reportError('mode-switch/setSubstyle', err); }
	},
	getState: () => ({
		mode: modeController?.getMode() || 'realtime',
		substyle: modeController?.getSubstyle?.() || 'normal',
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

// ---- T-3.12.1.b: IME composition state + host 事件桥 ----------------------
// createImeCompositionState 做 flush 兜底（未来 requestAutoSave 通路接入时用），
// compositionstart/end 翻转时向 host 上报 imeCompositionChanged，让 host 侧
// MilkdownWorkingCopy 的 _webviewComposing gate 消费（T-3.12.1.a）。
// 冒泡阶段挂在 #milkdown-root 上：composition 事件从 .ProseMirror 的
// contenteditable 冒泡上来；root DOM 常驻，跨 createEditor() 重建不重复挂。
// 走 host DOM addEventListener 而不是 ProseMirror EditorProps.handleDOMEvents
// —— 后者需要动 editorViewOptionsCtx slice，与 view-mode-editable 的 setProps
// 有耦合；预算自救优先保工时。
const imeCompositionState = createImeCompositionState({
	initialDoc: '',
	initialCursor: 0,
	// auto-save 主路径由 host 侧 MilkdownWorkingCopy._webviewComposing gate 保证
	// （T-3.12.1.a），本状态机 requestAutoSave 通路暂未接入；flush 回调仅在未来
	// 接线时用作兜底上报。当前不会被触发。
	onAutoSaveFlush: () => {
		try { vscode?.postMessage({ type: 'markdownUpdated', markdown: serialize() }); }
		catch { /* webview disposed */ }
	},
});

function postImeComposing(composing) {
	try { vscode?.postMessage({ type: 'imeCompositionChanged', composing: !!composing }); }
	catch { /* webview disposed */ }
}

if (root) {
	root.addEventListener('compositionstart', (event) => {
		try { imeCompositionState.handleCompositionStart(event?.data ?? ''); }
		catch (err) { reportError('ime/compositionstart', err); }
		postImeComposing(true);
	});
	root.addEventListener('compositionupdate', (event) => {
		// 只更新内部 buffer，不 postMessage —— compositionupdate 每次候选变化都
		// 触发，噪声太大；host gate 只关心翻转位。
		try { imeCompositionState.handleCompositionUpdate(event?.data ?? ''); }
		catch (err) { reportError('ime/compositionupdate', err); }
	});
	root.addEventListener('compositionend', (event) => {
		try { imeCompositionState.handleCompositionEnd(event?.data ?? ''); }
		catch (err) { reportError('ime/compositionend', err); }
		postImeComposing(false);
	});
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
