/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * T-3.8b.1 · HTML 导出装配（纯函数层）。
 *
 * webview 侧收集：editor DOM innerHTML 字符串 + 当前主题 CSS blob + 图片资源清单
 *  → 本函数拼装成 `<!doctype html>…</html>` 单文件（或 sibling-folder 模式 + assets 数组）
 *  → host 侧只负责 SaveAs + 落盘。
 *
 * 无 VS Code 服务依赖 / 无 DOM API 依赖 —— 只做字符串处理，方便 test/node/ 下用
 * mocha 直接 assert。运行时里 webview 侧调它，host 侧不 import。
 *
 * 设计取舍：
 *  1) DOM 过滤走**字符串 regex** 而不是 DOMParser：webview 侧已经能拿到干净的
 *     innerHTML，node 单测里不引 jsdom 也能跑；副作用是 regex 对畸形 HTML
 *     不鲁棒，但 ProseMirror 输出的 HTML 是良构的，可控。
 *  2) 图片替换以 `imageResources` map 为准 —— key 是 `<img src>` 原值（webview
 *     未做 URI 归一），value 里带 mime + base64（data-uri 模式）或 sibling
 *     relative path（sibling-folder 模式由本函数计算）。
 *  3) `assembleExportHtml` 输出 `{ html, assets? }`：
 *     - `data-uri` → `assets` 恒为 undefined
 *     - `sibling-folder` → `assets` 是 `[{ relativePath, base64 }, …]`
 *       host 侧遍历写入 `<targetDir>/<basename>_files/<relativePath>`。
 */

/** 图片资源 —— webview 侧读文件后传给本函数的原始素材。 */
export interface ExportImageResource {
	/** 原始 `<img src>` 属性值（可能是相对路径 / 绝对路径 / data URI 已存在等）。 */
	readonly originalSrc: string;
	/** MIME 类型，e.g. `image/png` / `image/jpeg`。 */
	readonly mime: string;
	/** base64 编码后的图片字节（不含 `data:...;base64,` 前缀）。 */
	readonly base64: string;
	/** 可选：webview 已经算好的目标文件名（sibling-folder 模式），无则由本函数生成。 */
	readonly suggestedFileName?: string;
}

/** assemble 入参。 */
export interface AssembleExportHtmlInput {
	/** editor DOM 的 innerHTML（webview 侧读 `document.getElementById('milkdown-root')?.innerHTML`）。 */
	readonly bodyInnerHtml: string;
	/** 当前主题 CSS blob（内置：`getThemesCss()` 输出 + 外挂 `themeCssPayload.cssText`）。 */
	readonly themeCss: string;
	/** Prism 高亮 CSS —— host 侧从 `milkdownEditorHtml.ts` 抽出的 token color 段。 */
	readonly prismCss: string;
	/** 当前生效主题 id，写到 `<body data-theme="...">`。 */
	readonly themeId: string;
	/** 文件名 stem，无扩展名，用于 `<title>` + sibling-folder 目录前缀。 */
	readonly title: string;
	/** 图片打包策略。 */
	readonly imageMode: 'data-uri' | 'sibling-folder';
	/** 原始 src → 资源 map（webview 侧读文件后填）。缺失的 img 保留原始 src，不报错。 */
	readonly imageResources?: ReadonlyMap<string, ExportImageResource>;
	/**
	 * T-3.8b.2 · 可选：打印专用 CSS（如 `@page { size: A4; margin: 20mm; }`）。
	 * 若非空，会以独立 `<style>` 块**追加**到 `<head>` 末尾（在主 style 之后），
	 * 保证 `@page` 规则不被主题 CSS 覆盖。HTML 导出不传，PDF 导出走 print 桥时传。
	 */
	readonly pageCss?: string;
}

/** assemble 输出 —— sibling-folder 模式下 assets 非空。 */
export interface AssembleExportHtmlOutput {
	readonly html: string;
	readonly assets?: ReadonlyArray<{ readonly relativePath: string; readonly base64: string }>;
}

/** minimal HTML reset —— 只保证盒模型 + 消除浏览器默认外边距，视觉细节交给主题 CSS。 */
const RESET_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: var(--vsword-body-font, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif); }
img { max-width: 100%; height: auto; }
pre { overflow-x: auto; }
`.trim();

/** 装配主入口 —— 纯函数，无副作用。 */
export function assembleExportHtml(input: AssembleExportHtmlInput): AssembleExportHtmlOutput {
	const cleaned = sanitizeExportedBodyHtml(input.bodyInnerHtml);
	const { html: withImages, assets } = rewriteImageSources({
		bodyHtml: cleaned,
		imageMode: input.imageMode,
		imageResources: input.imageResources,
		siblingFolder: `${input.title}_files`,
	});
	const styleBlock = [RESET_CSS, input.themeCss, input.prismCss].filter(s => s && s.trim().length > 0).join('\n');
	const themeAttr = input.themeId && input.themeId !== 'default'
		? ` data-theme="${escapeAttr(input.themeId)}"`
		: '';
	// T-3.8b.2: pageCss 走独立 <style> 块附加在主 style 之后，保证 @page 规则不被主题 CSS 覆盖。
	const pageStyleBlock = input.pageCss && input.pageCss.trim().length > 0
		? `\n<style data-vsword-role="page">\n${input.pageCss}\n</style>`
		: '';
	const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="generator" content="VSWord T-3.8b Export">
<title>${escapeHtml(input.title)}</title>
<style>
${styleBlock}
</style>${pageStyleBlock}
</head>
<body${themeAttr}>
<div id="milkdown-root">
<div class="ProseMirror">${withImages}</div>
</div>
</body>
</html>
`;
	return assets.length > 0 ? { html, assets } : { html };
}

// ---------------------------------------------------------------------------
// DOM 过滤 —— 字符串 regex 层。
// ---------------------------------------------------------------------------

/**
 * 从 editor innerHTML 里剥掉运行时残留：
 *  - `.milkdown-toolbar` / `.vsword-md-toolbar` / `.vsword-slash-menu` 等辅助容器
 *  - `contenteditable` attribute（导出成品必须只读）
 *  - `data-dragging` / `data-selected` / `data-hover` 等瞬态状态属性
 *  - `data-node-*`（ProseMirror 内部标注，纯运行时噪音）
 *  - `<script>` / `<style>` 内联（应统一走 <head>）
 *
 * 顺序敏感 —— 先剥容器再洗属性，避免正则回溯。
 */
export function sanitizeExportedBodyHtml(html: string): string {
	if (!html) return '';
	let out = html;
	// 1) 剥容器（贪婪匹配 balanced-ish；只针对确定不嵌套自身的类）
	for (const cls of RUNTIME_CONTAINER_CLASSES) {
		out = stripElementsByClass(out, cls);
	}
	// 2) 剥 script / style（正文里出现的都是残留，一并干掉）
	out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '');
	out = out.replace(/<style\b[\s\S]*?<\/style>/gi, '');
	// 3) 洗属性 —— contenteditable / draggable / spellcheck 全清；
	//    data-node-* / data-dragging / data-selected / data-hover 也清。
	out = out.replace(/\s+contenteditable="[^"]*"/gi, '');
	out = out.replace(/\s+contenteditable=[^\s>]*/gi, '');
	out = out.replace(/\s+draggable="[^"]*"/gi, '');
	out = out.replace(/\s+spellcheck="[^"]*"/gi, '');
	out = out.replace(/\s+data-node-[a-z-]+="[^"]*"/gi, '');
	out = out.replace(/\s+data-(dragging|selected|hover|drag-handle|active)="[^"]*"/gi, '');
	return out;
}

/** 运行时容器 class 白名单 —— 一定要删的。 */
const RUNTIME_CONTAINER_CLASSES: readonly string[] = [
	'milkdown-toolbar',
	'milkdown-slash-menu',
	'vsword-md-toolbar',
	'vsword-slash-menu',
	'vsword-block-handle',
	'vsword-code-block-toolbar',
	'vsword-find-widget',
	'vsword-backlinks-footer',
];

/**
 * 删除所有 `class="…<cls>…"` 匹配的顶层元素（含其内部）。
 *
 * 局限：不做 HTML parsing，只找 `<tag ... class="…cls…" ...>…</tag>` 的
 * 平衡区间。ProseMirror 导出的 toolbar/slash-menu 都是**单层** div，因此
 * 简化实现（找同名 tag 的下一个 `</tag>`）足够 —— 单测会覆盖典型 case。
 */
function stripElementsByClass(html: string, cls: string): string {
	// 匹配开标签：<tag ... class="…cls…" ...>
	const openRe = new RegExp(
		'<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*\\bclass="[^"]*\\b' + escapeRegex(cls) + '\\b[^"]*"[^>]*>',
		'g',
	);
	let out = html;
	// 循环处理 —— 每次删一个匹配项后重新扫描，避免嵌套误伤
	let iter = 0;
	while (iter++ < 32) {
		openRe.lastIndex = 0;
		const m = openRe.exec(out);
		if (!m) break;
		const tag = m[1];
		const openEnd = m.index + m[0].length;
		const closeTag = `</${tag}>`;
		// 找配对的关闭标签（不处理深度嵌套 —— 这些容器不嵌套自身）。
		// 兼容自闭合 tag（<xxx …/>）—— 直接删开标签。
		if (m[0].endsWith('/>')) {
			out = out.slice(0, m.index) + out.slice(openEnd);
			continue;
		}
		// 从 openEnd 开始找 nearest closeTag
		const closeIdx = out.indexOf(closeTag, openEnd);
		if (closeIdx === -1) {
			// 兜底：只删开标签，保留内容
			out = out.slice(0, m.index) + out.slice(openEnd);
			continue;
		}
		out = out.slice(0, m.index) + out.slice(closeIdx + closeTag.length);
	}
	return out;
}

// ---------------------------------------------------------------------------
// 图片改写 —— data-uri / sibling-folder 两种模式。
// ---------------------------------------------------------------------------

interface RewriteImageInput {
	readonly bodyHtml: string;
	readonly imageMode: 'data-uri' | 'sibling-folder';
	readonly imageResources: ReadonlyMap<string, ExportImageResource> | undefined;
	readonly siblingFolder: string;
}

interface RewriteImageOutput {
	readonly html: string;
	readonly assets: ReadonlyArray<{ readonly relativePath: string; readonly base64: string }>;
}

/**
 * 扫描 `<img src="…">`，按 imageMode 改写 src。
 *
 * 命中 `imageResources` 的 src 才改写；未命中（外链 `https://` / `data:` 已有）保持原样。
 * sibling-folder 模式下同时产出 assets 数组，含每个入围图片的落盘信息。
 */
export function rewriteImageSources(input: RewriteImageInput): RewriteImageOutput {
	const resources = input.imageResources;
	if (!resources || resources.size === 0) {
		return { html: input.bodyHtml, assets: [] };
	}
	const assets: Array<{ readonly relativePath: string; readonly base64: string }> = [];
	const usedNames = new Set<string>();
	const html = input.bodyHtml.replace(/<img\b([^>]*?)\bsrc="([^"]+)"([^>]*)>/gi, (whole, pre, src, post) => {
		const res = resources.get(src);
		if (!res) return whole;
		if (input.imageMode === 'data-uri') {
			const dataUri = `data:${res.mime || 'application/octet-stream'};base64,${res.base64}`;
			return `<img${pre}src="${escapeAttr(dataUri)}"${post}>`;
		}
		// sibling-folder
		const fileName = pickSiblingFileName(src, res.suggestedFileName, usedNames);
		usedNames.add(fileName);
		const rel = `${input.siblingFolder}/${fileName}`;
		assets.push({ relativePath: rel, base64: res.base64 });
		return `<img${pre}src="${escapeAttr(rel)}"${post}>`;
	});
	return { html, assets };
}

/** 给 sibling-folder 模式挑一个文件名 —— 沿用原 basename，冲突加 `-1/-2` 后缀（Typora 风）。 */
function pickSiblingFileName(originalSrc: string, suggested: string | undefined, used: Set<string>): string {
	const raw = (suggested && suggested.trim()) || originalSrc.replace(/^.*[\\/]/, '');
	const safeRaw = raw.replace(/[^A-Za-z0-9._\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
	if (!used.has(safeRaw)) return safeRaw;
	const dot = safeRaw.lastIndexOf('.');
	const stem = dot > 0 ? safeRaw.slice(0, dot) : safeRaw;
	const ext = dot > 0 ? safeRaw.slice(dot) : '';
	for (let i = 1; i < 1000; i++) {
		const cand = `${stem}-${i}${ext}`;
		if (!used.has(cand)) return cand;
	}
	return `${stem}-${Date.now()}${ext}`;
}

// ---------------------------------------------------------------------------
// escape 小工具
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
