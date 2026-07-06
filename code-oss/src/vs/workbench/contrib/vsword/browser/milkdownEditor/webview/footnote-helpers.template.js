// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord T-3.5c.2 · Footnote 引用+定义 helpers（纯函数 · 可 node 单测，无 Milkdown 依赖）
 *
 *  职责：
 *   1. `normalizeLabel(raw)` — 把 label 规范化成用于内部 map / 定位 dataset 的 key。
 *      GFM footnote 的 label 语义：**大小写敏感 保源码**，但内部索引/相互引用命中
 *      应容错（Foo == foo）。所以我们提供两条路径：`label` 保留原样写回源码，
 *      `key` (label.toLowerCase().trim()) 用作 map key / DOM selector。
 *   2. `sanitizeLabelForSelector(label)` — 转义特殊字符供 querySelector 用。
 *   3. `mdastToPlainText(node)` — 把 mdast footnoteDefinition 的 children 递归压平成纯文本，
 *      hover popover 预览用。不做 markdown 渲染，只抽 text/inlineCode/emphasis/strong 内文。
 *   4. `truncateForPreview(text, limit)` — 修剪 hover 预览文本，保 CJK 与 whitespace。
 *
 *  设计约束（PRD F-05..F-09）：
 *   - F-09 保源码：normalizeLabel 只做 key 计算，绝不改写回源码的 label 字段
 *   - helpers 零外部依赖：node-emoji / milkdown / prose 在 .tmp 才有，本文件必须在主 tsconfig
 *     项目里能被 mocha 单测直接 import。
 *--------------------------------------------------------------------------------------------*/

/**
 * 归一化 label 用作内部 map key。大小写归一化 + 首尾空白裁剪 + 内部连续空白折叠成单空格。
 * 保源码策略下：**原始 label 保存在节点 attrs.label 上写回；这里返回的仅是 key。**
 * @param {string} raw
 * @returns {string} 归一化 key（空串代表无效 label）
 */
export function normalizeLabel(raw) {
	if (typeof raw !== 'string') return '';
	return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 转义 label 供 `querySelector('[data-label="…"]')` 用。CSS.escape 在 jsdom / 老浏览器不一定齐全，
 * 手动兜底：所有非 `[A-Za-z0-9_-]` 字符统一转义。
 * @param {string} label
 * @returns {string}
 */
export function sanitizeLabelForSelector(label) {
	const s = typeof label === 'string' ? label : '';
	// 优先走原生 CSS.escape（jsdom 27.x 已支持）。
	if (typeof globalThis.CSS?.escape === 'function') {
		try { return globalThis.CSS.escape(s); } catch { /* fall through */ }
	}
	return s.replace(/["\\\n\r\t]/g, ch => '\\' + ch);
}

/**
 * 把 mdast 节点树压平成 preview 纯文本。不区分 paragraph / list，只抽 value 字段。
 * 递归安全（无限深度树只吃 stack，不做 cycle 校验——mdast 不会有 cycle）。
 * @param {any} node mdast 节点或 { children: [...] }
 * @returns {string}
 */
export function mdastToPlainText(node) {
	if (!node) return '';
	if (typeof node.value === 'string') return node.value;
	if (Array.isArray(node.children)) {
		const parts = [];
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			const chunk = mdastToPlainText(child);
			if (!chunk) continue;
			// block-level 分隔：paragraph / list / heading 之间加换行；inline 直接拼。
			if (i > 0 && isBlockish(child)) parts.push('\n');
			parts.push(chunk);
		}
		return parts.join('');
	}
	return '';
}

function isBlockish(node) {
	if (!node || typeof node.type !== 'string') return false;
	return node.type === 'paragraph' || node.type === 'list' || node.type === 'listItem'
		|| node.type === 'heading' || node.type === 'blockquote' || node.type === 'code'
		|| node.type === 'thematicBreak' || node.type === 'table';
}

/**
 * 修剪 preview 文本到指定长度，尾部加省略号（… U+2026）。
 * 尽量在 whitespace 处切分避免斩断词/CJK 半形。CJK 无 word boundary，直接按字符切。
 * @param {string} text
 * @param {number} [limit=240]
 * @returns {string}
 */
export function truncateForPreview(text, limit = 240) {
	if (typeof text !== 'string') return '';
	const t = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');  // 折叠多余空白
	if (t.length <= limit) return t;
	// 在最后一个空白处截断（保 CJK：允许 whitespace / newline / 中文标点）。
	const window = t.slice(0, limit + 1);
	const lastSpace = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
	const cut = lastSpace > limit * 0.6 ? lastSpace : limit;
	return t.slice(0, cut).replace(/\s+$/, '') + '…';
}

/**
 * 从当前 doc 里取所有 footnote_definition 节点，构造 label → summary 表。
 * ProseMirror doc 的遍历放在 caller 那边（这里不导入 prose 依赖，保 helpers 纯净）。
 * 但我们暴露一个 shape-only 的入口：接受 `[{ label, textContent }]`，产出 map。
 * @param {Array<{label: string, textContent: string}>} entries
 * @returns {Map<string, { label: string, preview: string }>} key = normalizeLabel(label)
 */
export function buildDefinitionIndex(entries) {
	const map = new Map();
	if (!Array.isArray(entries)) return map;
	for (const e of entries) {
		if (!e || typeof e.label !== 'string') continue;
		const key = normalizeLabel(e.label);
		if (!key) continue;
		// 首次 win：多个同 label 定义时 GFM 只解析第一个，我们保持一致。
		if (map.has(key)) continue;
		map.set(key, {
			label: e.label,
			preview: truncateForPreview(String(e.textContent || '')),
		});
	}
	return map;
}
