/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b.2 — mermaid view helper unit tests (pure functions, no DOM / mermaid).
// T-3.5b.3 — 错误 UI 打磨：新增纯函数 + jsdom NodeView 集成测。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
	getCodeBlockSource,
	buildThemedSource,
	extractMermaidError,
	mermaidIsEmpty,
	autoSizeTextareaPx,
	normalizeMermaidSource,
	formatErrorHeadline,
	parseErrorLineNumber,
	formatErrorStack,
	offsetOfLine,
} from '../../browser/milkdownEditor/webview/mermaid-view-helpers.template.js';
import {
	createMermaidNodeView,
	_installMermaidLoader,
	_resetMermaidStateForTest,
	broadcastMermaidTheme,
} from '../../browser/milkdownEditor/webview/mermaid-view.template.js';

suite('T-3.5b.2 · getCodeBlockSource', () => {
	test('returns textContent from PM-like node', () => {
		assert.strictEqual(getCodeBlockSource({ textContent: 'graph LR\n  A --> B' } as any), 'graph LR\n  A --> B');
	});

	test('null / undefined / missing textContent → empty', () => {
		assert.strictEqual(getCodeBlockSource(null as any), '');
		assert.strictEqual(getCodeBlockSource(undefined as any), '');
		assert.strictEqual(getCodeBlockSource({} as any), '');
	});

	test('non-string textContent → empty', () => {
		assert.strictEqual(getCodeBlockSource({ textContent: 42 } as any), '');
	});
});

suite('T-3.5b.2 · buildThemedSource', () => {
	test('prepends init frontmatter with dark theme when isDark=true', () => {
		const out = buildThemedSource('graph LR\n  A --> B', true);
		assert.match(out, /^%%\{init:\{'theme':'dark'\}\}%%/);
		assert.ok(out.endsWith('graph LR\n  A --> B'));
	});

	test('prepends init frontmatter with default theme when isDark=false', () => {
		const out = buildThemedSource('graph LR\n  A --> B', false);
		assert.match(out, /^%%\{init:\{'theme':'default'\}\}%%/);
	});

	test('respects user-provided %%{init:...}%% frontmatter and does NOT wrap', () => {
		const userSrc = `%%{init:{'theme':'forest'}}%%\ngraph LR\n  A --> B`;
		assert.strictEqual(buildThemedSource(userSrc, true), userSrc);
		assert.strictEqual(buildThemedSource(userSrc, false), userSrc);
	});

	test('leading whitespace before user init is tolerated', () => {
		const userSrc = `   %%{init:{'securityLevel':'strict'}}%%\ngraph LR`;
		assert.strictEqual(buildThemedSource(userSrc, true), userSrc);
	});

	test('null / undefined source → still produces valid themed empty frame', () => {
		const out = buildThemedSource(null, false);
		assert.match(out, /^%%\{init:\{'theme':'default'\}\}%%\n$/);
	});
});

suite('T-3.5b.2 · extractMermaidError', () => {
	test('reads err.hash.text + line (1-based) when present', () => {
		const err = { hash: { line: 2, text: "Parse error on line 3: Expected 'CLASS_DIAGRAM'" } };
		const msg = extractMermaidError(err);
		assert.ok(msg && msg.includes('行 3'));
		assert.ok(msg && msg.includes('Expected'));
	});

	test('falls back to err.hash.token when text missing', () => {
		const err = { hash: { line: 0, token: 'GRAPH' } };
		const msg = extractMermaidError(err);
		assert.ok(msg && msg.includes('GRAPH'));
	});

	test('falls back to Error.message on plain Error', () => {
		const err = new Error('Something broke');
		assert.strictEqual(extractMermaidError(err), 'Something broke');
	});

	test('null / undefined / non-object → null', () => {
		assert.strictEqual(extractMermaidError(null), null);
		assert.strictEqual(extractMermaidError(undefined), null);
		assert.strictEqual(extractMermaidError('string' as any), null);
	});

	test('strips leading "Error: " prefix and truncates to first line', () => {
		const err = new Error('Error: Bad diagram\nline 2\nline 3');
		const msg = extractMermaidError(err);
		assert.strictEqual(msg, 'Bad diagram');
	});
});

suite('T-3.5b.2 · mermaidIsEmpty', () => {
	test('true for null / undefined / "" / whitespace', () => {
		assert.strictEqual(mermaidIsEmpty(null), true);
		assert.strictEqual(mermaidIsEmpty(undefined), true);
		assert.strictEqual(mermaidIsEmpty(''), true);
		assert.strictEqual(mermaidIsEmpty('   \n\t'), true);
	});

	test('false for any visible content', () => {
		assert.strictEqual(mermaidIsEmpty('graph LR'), false);
		assert.strictEqual(mermaidIsEmpty('   A --> B   '), false);
	});
});

suite('T-3.5b.2 · autoSizeTextareaPx', () => {
	test('single line → min height (96)', () => {
		assert.strictEqual(autoSizeTextareaPx('x'), 96);
		assert.strictEqual(autoSizeTextareaPx(''), 96);
	});

	test('multi-line grows linearly', () => {
		const two = autoSizeTextareaPx('a\nb');
		const ten = autoSizeTextareaPx('a\n'.repeat(10));
		assert.ok(ten > two);
	});

	test('caps at max (480 default)', () => {
		const huge = 'x\n'.repeat(500);
		assert.strictEqual(autoSizeTextareaPx(huge), 480);
	});

	test('custom bounds respected', () => {
		assert.strictEqual(autoSizeTextareaPx('x', { minPx: 40, maxPx: 200 }), 40);
		assert.strictEqual(autoSizeTextareaPx('x\n'.repeat(30), { minPx: 40, maxPx: 200 }), 200);
	});
});

suite('T-3.5b.2 · normalizeMermaidSource', () => {
	test('strips trailing blank lines but preserves internal', () => {
		assert.strictEqual(normalizeMermaidSource('graph LR\n  A --> B\n\n\n'), 'graph LR\n  A --> B');
	});

	test('preserves leading indentation and empty inner lines', () => {
		assert.strictEqual(
			normalizeMermaidSource('  graph LR\n\n  A --> B'),
			'  graph LR\n\n  A --> B',
		);
	});

	test('null / undefined → empty', () => {
		assert.strictEqual(normalizeMermaidSource(null as any), '');
		assert.strictEqual(normalizeMermaidSource(undefined as any), '');
	});

	test('handles CRLF trailing whitespace', () => {
		assert.strictEqual(normalizeMermaidSource('A --> B\r\n\r\n'), 'A --> B');
	});
});

// ---- T-3.5b.3 · 新增纯函数 --------------------------------------------------

suite('T-3.5b.3 · formatErrorHeadline', () => {
	test('复用 extractMermaidError 的输出并截断到 80 字符', () => {
		const long = new Error('a'.repeat(200));
		const h = formatErrorHeadline(long);
		assert.strictEqual(h.length, 80);
		assert.ok(h.endsWith('…'));
	});
	test('自定义 maxLen', () => {
		const h = formatErrorHeadline(new Error('bad diagram'), 8);
		assert.strictEqual(h, 'bad dia…');
	});
	test('多行错误只保留第一行', () => {
		const err = new Error('first\nsecond\nthird');
		const h = formatErrorHeadline(err);
		assert.strictEqual(h, 'first');
	});
	test('null 输入回退到默认消息', () => {
		assert.strictEqual(formatErrorHeadline(null), 'Mermaid 渲染失败');
	});
});

suite('T-3.5b.3 · parseErrorLineNumber', () => {
	test('优先 err.hash.line（0-based → 1-based）', () => {
		assert.strictEqual(parseErrorLineNumber({ hash: { line: 0 } }), 1);
		assert.strictEqual(parseErrorLineNumber({ hash: { line: 4 } }), 5);
	});
	test('从消息 "Parse error on line N" 解析', () => {
		assert.strictEqual(parseErrorLineNumber(new Error('Parse error on line 7: bad token')), 7);
	});
	test('从消息 "line N:" 解析', () => {
		assert.strictEqual(parseErrorLineNumber(new Error('Something bad at line 42: nope')), 42);
	});
	test('无匹配 → null', () => {
		assert.strictEqual(parseErrorLineNumber(new Error('no location info')), null);
		assert.strictEqual(parseErrorLineNumber(null), null);
		assert.strictEqual(parseErrorLineNumber('str' as any), null);
	});
	test('hash.line 非有限数 → 回退到消息', () => {
		assert.strictEqual(parseErrorLineNumber({ hash: { line: 'bogus' }, message: 'on line 3' }), 3);
	});
});

suite('T-3.5b.3 · formatErrorStack', () => {
	test('包含 headline + hash JSON + stack', () => {
		const err: any = new Error('KaTeX bad');
		err.hash = { line: 1, text: 'oops' };
		err.stack = 'Error: bad\n    at foo';
		const s = formatErrorStack(err);
		assert.ok(s.includes('oops'));
		assert.ok(s.includes('"line": 1'));
		assert.ok(s.includes('at foo'));
	});
	test('无 stack 时至少含 headline + message', () => {
		const err: any = { message: 'plain' };
		const s = formatErrorStack(err);
		assert.ok(s.includes('plain'));
	});
	test('null / undefined → 空串', () => {
		assert.strictEqual(formatErrorStack(null), '');
		assert.strictEqual(formatErrorStack(undefined), '');
	});
	test('字符串错误也能格式化', () => {
		const s = formatErrorStack('boom' as any);
		assert.strictEqual(s, 'boom');
	});
});

suite('T-3.5b.3 · offsetOfLine', () => {
	test('line <= 1 → 0', () => {
		assert.strictEqual(offsetOfLine('a\nb\nc', 1), 0);
		assert.strictEqual(offsetOfLine('a\nb', 0), 0);
		assert.strictEqual(offsetOfLine('a\nb', -3), 0);
	});
	test('正确定位到第 N 行首字符 offset', () => {
		assert.strictEqual(offsetOfLine('abc\ndef\nghi', 2), 4);
		assert.strictEqual(offsetOfLine('abc\ndef\nghi', 3), 8);
	});
	test('CRLF 混行', () => {
		// 'abc\r\ndef' —— \r 也计入 offset，第 2 行首 = 5
		assert.strictEqual(offsetOfLine('abc\r\ndef', 2), 5);
	});
	test('行号越界 → 源码末尾', () => {
		const src = 'a\nb\nc';
		assert.strictEqual(offsetOfLine(src, 999), src.length);
	});
});

// ---- T-3.5b.3 · NodeView 集成 (jsdom) ---------------------------------------

/**
 * 构造一个最小 ProseMirror-like view + mermaid code_block node。
 * 只覆盖 NodeView 需要接触的表面：view.dom、view.state.doc.nodeAt、view.state.schema.text、view.dispatch、view.focus。
 */
function bootstrapView() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="host"></div></body></html>`, {
		url: 'http://localhost/',
	});
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore
	globalThis.queueMicrotask = (cb: () => void) => Promise.resolve().then(cb);

	const host = dom.window.document.querySelector('.host') as HTMLElement;
	// PM node stub — 只暴露 textContent + type + attrs + nodeSize
	function makeNode(src: string) {
		return {
			type: { name: 'code_block' },
			attrs: { language: 'mermaid' },
			textContent: src,
			nodeSize: src.length + 2, // 首尾 open/close token
		};
	}
	let currentNode = makeNode('graph LR\n  A --> B');
	const dispatched: any[] = [];
	const view: any = {
		dom: host,
		focus: () => { },
		dispatch: (tr: any) => { dispatched.push(tr); },
		state: {
			doc: { nodeAt: (_pos: number) => currentNode },
			schema: {
				text: (s: string) => ({ __text: s }),
			},
			get tr() {
				return {
					replaceWith(from: number, to: number, node: any) {
						return { kind: 'replaceWith', from, to, node };
					},
					delete(from: number, to: number) {
						return { kind: 'delete', from, to };
					},
				};
			},
		},
	};
	return { dom, host, view, dispatched, setNode: (src: string) => { currentNode = makeNode(src); return currentNode; } };
}

function teardownView() {
	// @ts-ignore
	delete globalThis.window;
	// @ts-ignore
	delete globalThis.document;
	// @ts-ignore
	delete globalThis.queueMicrotask;
	_resetMermaidStateForTest();
}

/** 空 loader：立刻 resolve mermaidApi。 */
function stubGoodLoader() {
	_installMermaidLoader(async () => ({
		default: {
			initialize() { },
			async render(_id: string, src: string) {
				return { svg: `<svg data-src="${src.length}"></svg>` };
			},
		},
	}));
}

/** parse-error loader：render 抛带 hash.line 的错误。 */
function stubParseErrorLoader() {
	_installMermaidLoader(async () => ({
		default: {
			initialize() { },
			async render(_id: string, _src: string) {
				const err: any = new Error('Parse error on line 3: unexpected token');
				err.hash = { line: 2, text: 'unexpected token FOO' };
				throw err;
			},
		},
	}));
}

/** runtime-fail loader：加载态直接 reject。 */
function stubRuntimeFailLoader() {
	let attempts = 0;
	_installMermaidLoader(async () => {
		attempts++;
		if (attempts === 1) throw new Error('chunk network fail');
		return {
			default: {
				initialize() { },
				async render(_id: string, _src: string) {
					return { svg: '<svg data-src="recovered"></svg>' };
				},
			},
		};
	});
	return { attempts: () => attempts };
}

async function flush() {
	// 让微任务队列彻底跑干：render 里有 await loadMermaid + await api.render + 状态回写
	for (let i = 0; i < 8; i++) {
		await Promise.resolve();
	}
}

suite('T-3.5b.3 · Mermaid NodeView — 空块占位', () => {
	test('空源码 → 占位符 "Click to add mermaid diagram"，不显示错误', async () => {
		const { view, setNode } = bootstrapView();
		const node = setNode('');
		stubGoodLoader();
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();
		const holder = nv._test.preview.querySelector('.vsword-mermaid-placeholder');
		assert.ok(holder, '预览区应含占位符');
		assert.strictEqual(holder!.textContent, 'Click to add mermaid diagram');
		assert.strictEqual(nv._test.errBar.hidden, true, '不应显示错误 banner');
		nv.destroy();
		teardownView();
	});
});

suite('T-3.5b.3 · Mermaid NodeView — 语法错误 banner', () => {
	test('render 抛错 → 顶部红条显示 headline + last-good 保留', async () => {
		const { view, setNode } = bootstrapView();
		// 先跑一次成功 render，让 lastGoodSvg 有值
		stubGoodLoader();
		let node = setNode('graph LR\n  A --> B');
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();
		assert.ok(nv._test.preview.querySelector('svg'), '首次应成功渲染 svg');

		// 切到 parse-error loader 触发一次 re-render
		stubParseErrorLoader();
		// 通过 update() 触发内容变化 → render
		node = setNode('bad\nmore\nsyntax');
		nv.update(node);
		await flush();

		assert.strictEqual(nv._test.errBar.hidden, false, '错误 banner 应可见');
		assert.ok(nv._test.errHeadline.textContent!.length > 0, 'headline 有内容');
		assert.ok(nv._test.errHeadline.textContent!.length <= 80, 'headline 不超过 80 字符');
		assert.strictEqual(nv._test.lastErrorKind, 'parse');
		assert.strictEqual(nv._test.lastErrorLine, 3, 'hash.line=2 → 1-based=3');

		// last-good svg 应仍在 preview 区（is-stale 标记）
		assert.ok(nv._test.preview.querySelector('svg'), 'last-good svg 仍保留');
		assert.ok(nv._test.preview.classList.contains('is-stale'), '带 is-stale 标记');

		nv.destroy();
		teardownView();
	});

	test('点击 headline → 展开详情面板', async () => {
		const { view, setNode } = bootstrapView();
		stubParseErrorLoader();
		const node = setNode('bad\nsyntax');
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();

		assert.strictEqual(nv._test.errDetail.hidden, true, '默认收起');

		nv._test.errHeadline.dispatchEvent(new (globalThis as any).window.MouseEvent('click', { bubbles: true, cancelable: true }));
		assert.strictEqual(nv._test.errDetail.hidden, false, '点击后应展开');
		assert.ok(nv._test.errDetail.textContent!.length > 0, '详情文本非空');
		assert.strictEqual(nv._test.errHeadline.getAttribute('aria-expanded'), 'true');

		// 再点一次 → 收起
		nv._test.errHeadline.dispatchEvent(new (globalThis as any).window.MouseEvent('click', { bubbles: true, cancelable: true }));
		assert.strictEqual(nv._test.errDetail.hidden, true);
		assert.strictEqual(nv._test.errHeadline.getAttribute('aria-expanded'), 'false');

		nv.destroy();
		teardownView();
	});

	test('复制按钮：clipboard 成功 → 状态反馈', async () => {
		const { view, setNode } = bootstrapView();
		stubParseErrorLoader();
		// 装个 clipboard.writeText mock
		let copied = '';
		// @ts-ignore
		globalThis.window.navigator.clipboard = { writeText: async (t: string) => { copied = t; } };
		const node = setNode('bad\nsyntax');
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();

		nv._test.btnCopy.dispatchEvent(new (globalThis as any).window.MouseEvent('click', { bubbles: true, cancelable: true }));
		await flush();
		assert.ok(copied.length > 0, 'clipboard 收到内容');
		assert.ok(copied.includes('unexpected token') || copied.includes('Parse error'), '内容含错误摘要');

		nv.destroy();
		teardownView();
	});

	test('定位按钮：在解析出行号时可见，点击后进入编辑态', async () => {
		const { view, setNode } = bootstrapView();
		stubParseErrorLoader();
		const node = setNode('line1\nline2\nline3\nline4');
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();

		assert.strictEqual(nv._test.btnLocate.hidden, false, '解析出行号 → 定位按钮显示');
		nv._test.btnLocate.dispatchEvent(new (globalThis as any).window.MouseEvent('click', { bubbles: true, cancelable: true }));
		// 让 queueMicrotask 里的 focus/select 跑完
		await flush();
		assert.strictEqual(nv._test.isEditing, true, '定位应把编辑态打开');

		nv.destroy();
		teardownView();
	});
});

suite('T-3.5b.3 · Mermaid NodeView — 运行时加载失败 + 重试', () => {
	test('loader 首次失败 → runtime headline + 重试按钮可见；点击重试后恢复', async () => {
		const { view, setNode } = bootstrapView();
		const g = stubRuntimeFailLoader();
		const node = setNode('graph LR\n  A --> B');
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();

		assert.strictEqual(nv._test.errBar.hidden, false, 'runtime 失败应显示红条');
		assert.strictEqual(nv._test.lastErrorKind, 'runtime');
		assert.strictEqual(nv._test.btnRetry.hidden, false, '重试按钮应可见');
		assert.strictEqual(nv._test.btnLocate.hidden, true, '运行时错误无行号，定位应隐藏');
		assert.ok(nv._test.errHeadline.textContent!.includes('failed to load'));

		// 点击重试
		nv._test.btnRetry.dispatchEvent(new (globalThis as any).window.MouseEvent('click', { bubbles: true, cancelable: true }));
		await flush();
		await flush();

		assert.ok(g.attempts() >= 2, 'loader 应被再次调用');
		assert.strictEqual(nv._test.errBar.hidden, true, '成功 render 后红条消失');
		assert.ok(nv._test.preview.querySelector('svg'), '恢复后 svg 已渲染');

		nv.destroy();
		teardownView();
	});
});

suite('T-3.5b.3 · Mermaid NodeView — 主题广播不打破错误态', () => {
	test('错误后切主题 → re-render 仍为错误但 banner 不消失', async () => {
		const { view, setNode } = bootstrapView();
		stubParseErrorLoader();
		const node = setNode('bad\nsource');
		const nv: any = createMermaidNodeView(node, view, () => 0);
		await flush();
		assert.strictEqual(nv._test.errBar.hidden, false);

		broadcastMermaidTheme(true); // isDark 切换
		await flush();
		assert.strictEqual(nv._test.errBar.hidden, false, '主题变化后仍是错误态');

		nv.destroy();
		teardownView();
	});
});
