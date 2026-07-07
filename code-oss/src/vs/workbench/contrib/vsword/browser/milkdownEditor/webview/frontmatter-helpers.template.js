// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.3 · Frontmatter helpers（YAML/TOML/JSON 三味 · 无 npm 依赖 · 可主项目 tsc 编译）
//
// 职责：
//   1. FLAVORS + isValidFlavor(v)：枚举 + 校验（'yaml'|'toml'|'json'）
//   2. extractTopLevelKeys(value, flavor)：轻量顶层键提取，用于折叠态摘要
//      —— 不完整 parse，只扫顶层「行首 key: / key = / "key":」，用于渲染时不阻塞
//   3. summarizeFrontmatter(value, flavor)：{ title, keys, fieldCount, flavor }
//   4. formatSummaryLabel(summary)：折叠态一行文案「📄 <title> · N fields」
//   5. firstLineOfError(err, flavor)：{ line, column, message } —— js-yaml/toml
//      parser 抛出的错误对象里抽第一行错位（parser 注入调用方，helpers 只做规范化）
//   6. detectFrontmatterError(value, flavor, parsers)：跑注入 parser 试探性 parse，
//      失败返回 firstLineOfError，成功返回 null
//   7. FLAVOR_FENCE：调试用的 fence marker 表（真实 fence 走 remark-frontmatter，
//      helpers 里只在 stripFence / addFence 类工具场景使用，供 fixture 断言）
//
// 设计约束（PRD F-10..F-16）：
//   - **保源码优先**：所有 helpers 只读 value，不重写；写回由 remark-stringify 处理
//   - **零依赖**：主 tsconfig 项目里能 import；不能 pull in js-yaml/@iarna/toml
//     （那两个只在 .tmp/milkdown-prod-builder/node_modules 里）
//   - **不阻塞 UI**：summarize 走正则 fast-path，最坏情况返回 `{ title:null, keys:[] }` 而非抛错

/** @typedef {'yaml' | 'toml' | 'json'} FrontmatterFlavor */

export const FLAVORS = Object.freeze(['yaml', 'toml', 'json']);

/**
 * fence marker 表：flavor → { open, close }
 * remark-frontmatter 用 3 字符 marker 生成 `---` / `+++`；JSON 用 `{` / `}` 单字符 fence，
 * 但 remark-frontmatter fence 最短 3 字符 —— 我们用 3 花括号 `{{{...}}}` 作 JSON fence，
 * 兼顾解析歧义（真实 JSON `{...}` 会与内容冲突）。测试端可切换成 `{`/`}`。
 */
export const FLAVOR_FENCE = Object.freeze({
	yaml: Object.freeze({ open: '---', close: '---' }),
	toml: Object.freeze({ open: '+++', close: '+++' }),
	// JSON 在 T-3.5c.3 中降级；保留常量给以后 T 用。
	json: Object.freeze({ open: '{{{', close: '}}}' }),
});

/**
 * @param {unknown} v
 * @returns {v is FrontmatterFlavor}
 */
export function isValidFlavor(v) {
	return typeof v === 'string' && FLAVORS.includes(v);
}

// -----------------------------------------------------------------------------
// 顶层键提取
// -----------------------------------------------------------------------------

/**
 * 从 YAML 原文中扫顶层键。仅支持行首（可选 BOM/空白零缩进）+ `key: ` 形式。
 * 复合/引号键 / 缩进的 map 子键都视为非顶层。
 * @param {string} value
 * @returns {string[]}
 */
function yamlTopLevelKeys(value) {
	if (typeof value !== 'string' || value.length === 0) return [];
	const out = [];
	const seen = new Set();
	const lines = value.split(/\r?\n/);
	for (const raw of lines) {
		// 只关心零缩进行；tab 也算缩进（YAML 不允许 tab，但保守起见跳过）。
		if (/^\s/.test(raw)) continue;
		// 空行、注释跳过。
		if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
		// key: 或 key: value；key 允许 A-Za-z0-9_.-，支持引号包裹。
		// 引号形式：`"key": value` / `'key': value`
		let m;
		if ((m = /^(["'])((?:\\\1|(?!\1).)+)\1\s*:(\s|$)/.exec(raw))) {
			pushKey(out, seen, m[2]);
			continue;
		}
		if ((m = /^([A-Za-z_][A-Za-z0-9_\-.]*)\s*:(\s|$)/.exec(raw))) {
			pushKey(out, seen, m[1]);
			continue;
		}
	}
	return out;
}

/**
 * 从 TOML 原文中扫顶层键。仅支持根表下 `key = value` 形式（首个 `[section]` 之前）。
 * @param {string} value
 * @returns {string[]}
 */
function tomlTopLevelKeys(value) {
	if (typeof value !== 'string' || value.length === 0) return [];
	const out = [];
	const seen = new Set();
	const lines = value.split(/\r?\n/);
	for (const raw of lines) {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		// 遇到 section header 后停止（进入子表就不算根键了）。
		if (/^\[/.test(trimmed)) break;
		let m;
		if ((m = /^(["'])((?:\\\1|(?!\1).)+)\1\s*=/.exec(trimmed))) {
			pushKey(out, seen, m[2]);
			continue;
		}
		if ((m = /^([A-Za-z_][A-Za-z0-9_\-]*)\s*=/.exec(trimmed))) {
			pushKey(out, seen, m[1]);
			continue;
		}
	}
	return out;
}

/**
 * 从 JSON 原文中扫顶层键。走极简状态机：只在深度 1 采集 `"key":`。
 * 有语法错误时尽力而为（返回已收集到的）。
 * @param {string} value
 * @returns {string[]}
 */
function jsonTopLevelKeys(value) {
	if (typeof value !== 'string' || value.length === 0) return [];
	const s = value.trim();
	if (!s.startsWith('{')) return [];
	const out = [];
	const seen = new Set();
	let depth = 0;
	let inString = false;
	let esc = false;
	let stringBuf = '';
	let awaitingColon = false;
	let pendingKey = null;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inString) {
			if (esc) { stringBuf += c; esc = false; continue; }
			if (c === '\\') { stringBuf += c; esc = true; continue; }
			if (c === '"') {
				inString = false;
				if (depth === 1 && !awaitingColon) {
					pendingKey = decodeJsonString(stringBuf);
					awaitingColon = true;
				}
				stringBuf = '';
				continue;
			}
			stringBuf += c;
			continue;
		}
		if (c === '"') { inString = true; stringBuf = ''; continue; }
		if (c === '{') { depth++; continue; }
		if (c === '}') { depth--; awaitingColon = false; pendingKey = null; continue; }
		if (c === '[') { depth++; continue; }
		if (c === ']') { depth--; continue; }
		if (c === ':' && awaitingColon && depth === 1) {
			if (pendingKey !== null) pushKey(out, seen, pendingKey);
			pendingKey = null;
			awaitingColon = false;
			continue;
		}
		if (c === ',' && depth === 1) {
			awaitingColon = false;
			pendingKey = null;
			continue;
		}
	}
	return out;
}

function decodeJsonString(raw) {
	try { return JSON.parse('"' + raw + '"'); }
	catch { return raw; }
}

function pushKey(out, seen, key) {
	if (typeof key !== 'string' || key.length === 0) return;
	if (seen.has(key)) return;
	seen.add(key);
	out.push(key);
}

/**
 * @param {string} value
 * @param {FrontmatterFlavor} flavor
 * @returns {string[]}
 */
export function extractTopLevelKeys(value, flavor) {
	if (typeof value !== 'string') return [];
	switch (flavor) {
		case 'yaml': return yamlTopLevelKeys(value);
		case 'toml': return tomlTopLevelKeys(value);
		case 'json': return jsonTopLevelKeys(value);
		default: return [];
	}
}

// -----------------------------------------------------------------------------
// summarize + label
// -----------------------------------------------------------------------------

/**
 * 从 YAML 原文中试着抠出 `title:` 顶层字段的值（仅根级、只支持一行字面值）。
 * 引号会剥掉；抠不到返回 null。
 */
function yamlExtractTitle(value) {
	if (typeof value !== 'string') return null;
	const lines = value.split(/\r?\n/);
	for (const raw of lines) {
		if (/^\s/.test(raw)) continue;
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		const m = /^title\s*:\s*(.+?)\s*$/i.exec(trimmed);
		if (!m) continue;
		return stripQuotes(m[1]);
	}
	return null;
}

function tomlExtractTitle(value) {
	if (typeof value !== 'string') return null;
	const lines = value.split(/\r?\n/);
	for (const raw of lines) {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		if (/^\[/.test(trimmed)) break;
		const m = /^title\s*=\s*(.+?)\s*$/i.exec(trimmed);
		if (!m) continue;
		return stripQuotes(m[1]);
	}
	return null;
}

function jsonExtractTitle(value) {
	if (typeof value !== 'string') return null;
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === 'object' && typeof parsed.title === 'string') return parsed.title;
	} catch { /* fall through */ }
	return null;
}

function stripQuotes(v) {
	if (typeof v !== 'string') return null;
	const s = v.trim();
	if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
		return s.slice(1, -1);
	}
	// YAML 多行 / 复杂结构不算 title（返回 null）。
	if (s.startsWith('|') || s.startsWith('>') || s.startsWith('{') || s.startsWith('[')) return null;
	return s;
}

/**
 * @typedef {Object} FrontmatterSummary
 * @property {FrontmatterFlavor} flavor
 * @property {string|null} title
 * @property {string[]} keys
 * @property {number} fieldCount
 */

/**
 * @param {string} value
 * @param {FrontmatterFlavor} flavor
 * @returns {FrontmatterSummary}
 */
export function summarizeFrontmatter(value, flavor) {
	const safeFlavor = isValidFlavor(flavor) ? flavor : 'yaml';
	const keys = extractTopLevelKeys(value, safeFlavor);
	let title = null;
	switch (safeFlavor) {
		case 'yaml': title = yamlExtractTitle(value); break;
		case 'toml': title = tomlExtractTitle(value); break;
		case 'json': title = jsonExtractTitle(value); break;
	}
	return { flavor: safeFlavor, title, keys, fieldCount: keys.length };
}

/**
 * 折叠态一行文案：
 *   有 title  → "📄 <title> · <n> fields"
 *   无 title  → "📄 <FLAVOR> · <n> fields"
 *   无字段    → "📄 <FLAVOR>（空）"
 *
 * @param {FrontmatterSummary} summary
 * @returns {string}
 */
export function formatSummaryLabel(summary) {
	if (!summary || typeof summary !== 'object') return '📄 frontmatter';
	const flavor = String(summary.flavor || 'yaml').toUpperCase();
	if (summary.fieldCount === 0) return `📄 ${flavor}（空）`;
	const label = summary.title && summary.title.length > 0 ? summary.title : flavor;
	return `📄 ${label} · ${summary.fieldCount} fields`;
}

// -----------------------------------------------------------------------------
// error 定位
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} FrontmatterError
 * @property {number} line 1-indexed 行号；未知为 1
 * @property {number|null} column 1-indexed 列号；未知为 null
 * @property {string} message 单行错误摘要
 */

/**
 * 把 js-yaml / TOML / JSON parser 抛出的错误对象规范化成 { line, column, message }。
 * 支持的形状：
 *   - js-yaml YAMLException.mark = { line, column, position, snippet }
 *   - @iarna/toml TomlError（message 里带 "at row N, col M"）
 *   - 原生 JSON.parse SyntaxError（message 里带 "position N"）
 *   - 通用 Error（回退到 line=1）
 *
 * @param {unknown} err
 * @param {FrontmatterFlavor} [flavor]
 * @returns {FrontmatterError}
 */
export function firstLineOfError(err, flavor) {
	if (err == null) return { line: 1, column: null, message: '' };
	const message = extractMessage(err);
	// js-yaml：mark 是首选，line/column 均 0-indexed
	const mark = err && typeof err === 'object' ? /** @type {any} */(err).mark : null;
	if (mark && Number.isFinite(mark.line)) {
		return {
			line: (mark.line | 0) + 1,
			column: Number.isFinite(mark.column) ? (mark.column | 0) + 1 : null,
			message,
		};
	}
	// @iarna/toml：`... at row N, col M, pos P:`
	const tomlMatch = /at row (\d+), col (\d+)/.exec(message);
	if (tomlMatch) {
		return { line: parseInt(tomlMatch[1], 10) || 1, column: parseInt(tomlMatch[2], 10) || null, message };
	}
	// TOML 里也可能是 `Unknown character "%" at line N column M`
	const altMatch = /line (\d+)(?:[^\d]+column (\d+))?/i.exec(message);
	if (altMatch) {
		return { line: parseInt(altMatch[1], 10) || 1, column: altMatch[2] ? parseInt(altMatch[2], 10) : null, message };
	}
	// JSON SyntaxError: "Unexpected token ... in JSON at position N"
	if (flavor === 'json') {
		const posMatch = /position (\d+)/.exec(message);
		if (posMatch) {
			// position 是字符偏移，不能直接给行 —— 交给上层结合原文换算（这里给 1 兜底）。
			return { line: 1, column: null, message };
		}
	}
	return { line: 1, column: null, message };
}

function extractMessage(err) {
	if (err == null) return '';
	if (typeof err === 'string') return err;
	if (typeof err === 'object') {
		const m = /** @type {any} */ (err).message;
		if (typeof m === 'string' && m.length > 0) return m.split('\n')[0];
		try { return String(err); } catch { return ''; }
	}
	return String(err);
}

/**
 * @typedef {(value: string) => unknown} FrontmatterParserFn
 * @typedef {Partial<Record<FrontmatterFlavor, FrontmatterParserFn>>} FrontmatterParsers
 */

/**
 * 用注入的 parser 试探 value；成功返回 null，失败返回 { line, column, message }。
 * 传入 parsers 为空或没匹配 flavor 的 parser → 直接返回 null（认为「无法验证」= 不报错）。
 *
 * @param {string} value
 * @param {FrontmatterFlavor} flavor
 * @param {FrontmatterParsers} [parsers]
 * @returns {FrontmatterError|null}
 */
export function detectFrontmatterError(value, flavor, parsers) {
	if (typeof value !== 'string') return null;
	if (!isValidFlavor(flavor)) return null;
	const fn = parsers && parsers[flavor];
	if (typeof fn !== 'function') return null;
	try {
		fn(value);
		return null;
	} catch (err) {
		return firstLineOfError(err, flavor);
	}
}

// -----------------------------------------------------------------------------
// fence 剥/加（辅助工具，主流程用 remark-frontmatter，helpers 里给 fixture 用）
// -----------------------------------------------------------------------------

/**
 * 把整段 raw block（含 fence）剥掉 fence，只留内部。
 * 输入不含 fence 时原样返回。
 * @param {string} rawBlock
 * @param {FrontmatterFlavor} flavor
 * @returns {string}
 */
export function stripFence(rawBlock, flavor) {
	if (typeof rawBlock !== 'string' || rawBlock.length === 0) return '';
	const fence = FLAVOR_FENCE[flavor];
	if (!fence) return rawBlock;
	const openRe = new RegExp('^' + escapeRegex(fence.open) + '\\r?\\n');
	const closeRe = new RegExp('\\r?\\n' + escapeRegex(fence.close) + '\\s*$');
	if (!openRe.test(rawBlock) || !closeRe.test(rawBlock)) return rawBlock;
	return rawBlock.replace(openRe, '').replace(closeRe, '');
}

/**
 * 把内部内容包上 fence。
 * @param {string} inner
 * @param {FrontmatterFlavor} flavor
 * @returns {string}
 */
export function addFence(inner, flavor) {
	const fence = FLAVOR_FENCE[flavor];
	if (!fence) return String(inner ?? '');
	const body = String(inner ?? '');
	return `${fence.open}\n${body}${body.endsWith('\n') ? '' : '\n'}${fence.close}`;
}

function escapeRegex(s) {
	return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
