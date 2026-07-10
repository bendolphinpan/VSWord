/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.13.4 · Typewriter AC + 单测
//
// 覆盖 `docs/plans/003-phase3-fix-p0-round2.md` §4.4 的 AC-4.1 ~ AC-4.4：
//
//   AC-4.1  typewriter 模式 · 光标 top-level block 的屏幕垂直中心位于视口
//           50% ± 15% 区间（覆盖 smooth scroll 中间态 + 行高抖动）
//   AC-4.2  页面总内容高度 < 视口高度时不强制居中（AC 允许自然顶部对齐）
//   AC-4.3  intra-line 字符输入（8px 阈内）不触发 recenter（防抖动）
//   AC-4.4  切离 typewriter（→ normal / focus）后 lastCenterY 重置为 -1
//
// 策略：typewriter 完整回路（selection → coordsAtPos → scrollIntoView）依赖
// Milkdown + ProseMirror + 真实 DOM 布局；bundle 进 node/mocha 成本极高。改而
// 断言从 focus-mode.template.js 抽出的**纯函数决策层**（focus-mode-helpers.template.js）
// 契约，把行为写死进单测防回归。剩余"视觉是否真居中到 50%"由 QA 手测
// checklist（phase-3.12.1-ime-autosave-checklist.md）承接。
//
// 单跑命令：
//   node code-oss/test/scripts/run-typewriter-test.mjs

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
// @ts-ignore — .template.js 是纯 JS 模块，无 .d.ts。
import {
	typewriterEnabled,
	hoverEnabled,
	shouldRecenter,
	contentFitsInViewport,
} from '../../browser/milkdownEditor/webview/focus-mode-helpers.template.js';

// ---------------------------------------------------------------------------
// jsdom 工具
// ---------------------------------------------------------------------------

function makeShell(substyle: 'normal' | 'focus' | 'typewriter', mode: 'realtime' | 'reading' | 'source' = 'realtime') {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>` +
		`<div class="vsword-md-shell" data-mode="${mode}" data-substyle="${substyle}"></div>` +
		`</body></html>`,
		{ url: 'http://localhost/' },
	);
	const shell = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
	return { dom, shell };
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

suite('T-3.13.4 · typewriter helpers · substyle 读取', () => {

	test('typewriterEnabled · data-substyle=typewriter → true', () => {
		const { shell } = makeShell('typewriter');
		assert.strictEqual(typewriterEnabled(shell), true);
	});

	test('typewriterEnabled · data-substyle=focus → false', () => {
		const { shell } = makeShell('focus');
		assert.strictEqual(typewriterEnabled(shell), false);
	});

	test('typewriterEnabled · data-substyle=normal → false', () => {
		const { shell } = makeShell('normal');
		assert.strictEqual(typewriterEnabled(shell), false);
	});

	test('typewriterEnabled · reading × typewriter → true（阅读态下 substyle 直通 · 与 T-3.13.2 修复方向 A 一致）', () => {
		const { shell } = makeShell('typewriter', 'reading');
		assert.strictEqual(typewriterEnabled(shell), true);
	});

	test('typewriterEnabled · null shell → false（无 shell 兜底不抛）', () => {
		assert.strictEqual(typewriterEnabled(null), false);
		assert.strictEqual(typewriterEnabled(undefined), false);
	});

	test('hoverEnabled · 仅在 data-substyle=focus 下开', () => {
		assert.strictEqual(hoverEnabled(makeShell('focus').shell), true);
		assert.strictEqual(hoverEnabled(makeShell('typewriter').shell), false);
		assert.strictEqual(hoverEnabled(makeShell('normal').shell), false);
		assert.strictEqual(hoverEnabled(null), false);
	});
});

suite('T-3.13.4 · typewriter · AC-4.1 长文档 · 输入行居中 ± tolerance', () => {

	// AC-4.1 的"视口中心 50% ± 15%"是**视觉断言**：完整回路是 caret Y →
	// scrollIntoView({block:'center'}) → 浏览器把 caret 挪到视口 50%。webview
	// 里 scrollIntoView 在 Chromium 是硬实现，无 mock 空间。因此本单测断言的是
	// **决策层契约**：只要 caret 每跨过 line-height（8px）就 fire scrollIntoView
	// 一次，视觉居中由浏览器 API 保证。tolerance ± 15% 由 QA 手测覆盖。

	test('AC-4.1a · lastCenterY = -1（首次） · currentY 任意 → 应 recenter', () => {
		// 长文档进入 typewriter 时，view.update 首帧就应该把当前行拉到中间。
		assert.strictEqual(
			shouldRecenter({ lastCenterY: -1, currentY: 400, force: false, threshold: 8 }),
			true,
			'首次 lastCenterY=-1 应无条件 recenter（保证进入 typewriter 立即居中）',
		);
	});

	test('AC-4.1b · currentY 与 lastCenterY 差 20px（跨行）→ 应 recenter', () => {
		// 光标下移一行（假设行高 20px），跨过 8px 阈值 → 触发一次重居中。
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 420, force: false, threshold: 8 }),
			true,
			'跨过 line-height 阈值应 recenter',
		);
	});

	test('AC-4.1c · currentY 与 lastCenterY 差恰好 8px（阈值边界）→ 应 recenter（>= 语义）', () => {
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 408, force: false, threshold: 8 }),
			true,
			'阈值边界 |Δ|=threshold 应触发（>=，不是 >）',
		);
	});

	test('AC-4.1d · force=true 时无条件 recenter（除非 currentY 无效）', () => {
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 401, force: true, threshold: 8 }),
			true,
			'force=true 忽略 intra-line 阈值（用于 typewriter attribute 翻转即时居中）',
		);
	});
});

suite('T-3.13.4 · typewriter · AC-4.2 短文档 · 不强制居中', () => {

	test('AC-4.2a · contentHeight < viewportHeight → 短文档判定', () => {
		// 200px 内容装进 800px 视口：AC 允许自然顶部对齐，scrollIntoView 也会 no-op。
		assert.strictEqual(contentFitsInViewport(200, 800), true);
	});

	test('AC-4.2b · contentHeight == viewportHeight → 边界视为短文档（无需滚动）', () => {
		assert.strictEqual(contentFitsInViewport(800, 800), true);
	});

	test('AC-4.2c · contentHeight > viewportHeight → 长文档 · 不属于 AC-4.2 豁免', () => {
		assert.strictEqual(contentFitsInViewport(1600, 800), false);
	});

	test('AC-4.2d · viewportHeight = 0（隐藏 tab / 折叠面板）→ false（无有效视口不判定）', () => {
		assert.strictEqual(contentFitsInViewport(200, 0), false);
	});

	test('AC-4.2e · 非有限数（NaN/Infinity）→ false（防御性）', () => {
		assert.strictEqual(contentFitsInViewport(NaN, 800), false);
		assert.strictEqual(contentFitsInViewport(200, Infinity), false);
	});
});

suite('T-3.13.4 · typewriter · AC-4.3 intra-line 抖动不触发 recenter', () => {

	test('AC-4.3a · 光标水平移动 1px（同一行）→ 不 recenter', () => {
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 401, force: false, threshold: 8 }),
			false,
			'intra-line 微移动应 skip（防每字节抖动）',
		);
	});

	test('AC-4.3b · 光标垂直移动 7px（阈内 · 行高抖动）→ 不 recenter', () => {
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 407, force: false, threshold: 8 }),
			false,
			'|Δy| < threshold 应 skip',
		);
	});

	test('AC-4.3c · 光标垂直移动 3px 向上（同一行）→ 不 recenter', () => {
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 397, force: false, threshold: 8 }),
			false,
			'反向 intra-line 抖动同样应 skip',
		);
	});

	test('AC-4.3d · currentY = null（coords 取不到）→ 不 recenter（防抛错）', () => {
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: null, force: false, threshold: 8 }),
			false,
			'coordsAtPos 失败时 skip（focus-mode.template.js 契约保持）',
		);
	});

	test('AC-4.3e · 自定义 threshold=0（禁用防抖）· 任意变化都 recenter', () => {
		// 允许调用方按需覆写阈值 —— 当前 focus-mode.template.js 硬编码 8，
		// 但 helper 保留自定义 API 供未来 QA 手测复现或降噪调参用。
		assert.strictEqual(
			shouldRecenter({ lastCenterY: 400, currentY: 401, force: false, threshold: 0 }),
			true,
		);
	});
});

suite('T-3.13.4 · typewriter · AC-4.4 切离 typewriter 后 lastCenterY 重置', () => {

	// focus-mode.template.js L86: `if (!typewriterEnabled(shell)) { lastCenterY = -1; return; }`
	// 这里断言的是"切离后 typewriterEnabled → false"这一契约。lastCenterY 的实际
	// 重置由 focus-mode.template.js 里那行代码承担，helper 本身不持有状态。

	test('AC-4.4a · substyle=focus → typewriterEnabled=false（触发 lastCenterY 重置分支）', () => {
		const { shell } = makeShell('focus');
		assert.strictEqual(typewriterEnabled(shell), false,
			'切到 focus 后 maybeRecenter 应走 reset 分支（lastCenterY = -1）');
	});

	test('AC-4.4b · substyle=normal → typewriterEnabled=false', () => {
		const { shell } = makeShell('normal');
		assert.strictEqual(typewriterEnabled(shell), false);
	});

	test('AC-4.4c · 切回 typewriter 后仍应从 lastCenterY=-1 起步（首次 force）', () => {
		// 契约意义：切离 → 再切回时，第一次 maybeRecenter(force=true) 应走"首次
		// 无条件 recenter"分支（lastCenterY < 0）。
		assert.strictEqual(
			shouldRecenter({ lastCenterY: -1, currentY: 400, force: true, threshold: 8 }),
			true,
			'切回 typewriter 首帧应无条件居中',
		);
	});
});
