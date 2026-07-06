// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord T-3.5c.1 · Emoji shortcode 保源码
 *
 *  设计要点（PRD 003c §8 T-3.5c.1 · F-01/02/03/04）：
 *   - **inline atom node**（不是 mark）：atom node 天然分离 attrs（存 shortcode name）
 *     和 toDOM（渲染 unicode 图形），可以同时满足「显示 unicode」+「保源码 :name:」。
 *   - **自研 remark 插件**：不用官方 remark-emoji（默认转 unicode 与 F-03 保源码策略冲突，
 *     且 emoticon 支持带来的边界扩展与 GFM strikethrough / footnote 交互复杂）。
 *     自研只做一件事：`:name:` → mdast { type: 'emoji', name, unicode }；stringify 回 `:name:`。
 *   - **未识别兜底**（F-04）：node-emoji 查表返回 null 时保留文本原样，不进 emoji 节点。
 *   - **Esc 撤销**（F-02 可选）：本轮跳过；ProseMirror InputRule 内建 undoInputRule 已可
 *     通过 `Mod-z` 回退到 shortcode 文本，`Esc` 单键回退成本高于价值，评估后跳过。
 *
 *  Data path:
 *    parse:  ':smile: hi'
 *      --(vswordRemarkEmoji visitor · EMOJI_RE + node-emoji.get)-->
 *      mdast [{ type:'emoji', name:'smile', unicode:'🙂' }, { type:'text', value:' hi' }]
 *      --(emojiSchema.parseMarkdown runner)--> PM node 'emoji' with attrs { name, unicode }
 *    write:  PM node 'emoji' { name:'smile', unicode:'🙂' }
 *      --(emojiSchema.toMarkdown)--> mdast { type:'emoji', name:'smile' }
 *      --(toMarkdownExtensions.emoji)--> `:smile:`
 *
 *  Won't-do（PRD Q2/NG）：
 *   - 不改成 unicode 序列化；始终保源码 `:name:`
 *   - 不做候选补全（那是后续 T-3.5c.x autocomplete，非本任务）
 *--------------------------------------------------------------------------------------------*/

import { $nodeSchema, $remark, $inputRule } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { visit } from 'unist-util-visit';
import { get as nodeEmojiGet } from 'node-emoji';
import { EMOJI_RE, stringifyEmoji } from './emoji-helpers.mjs';

// -----------------------------------------------------------------------------
// Resolver: shortcode name → unicode string | null
// -----------------------------------------------------------------------------
// node-emoji@2.x：`.get(name)` 命中返回 unicode，未命中返回 undefined。
// 注意：node-emoji v2 的 `.get()` 也接受带冒号 ':smile:'，但我们统一喂裸 name。
function resolveEmoji(name) {
	if (typeof name !== 'string' || name.length === 0) return null;
	try {
		const u = nodeEmojiGet(name);
		if (typeof u === 'string' && u.length > 0 && !u.startsWith(':')) {
			// node-emoji 在未命中时可能返回 `:name:` 原文（v2 行为），过滤掉。
			return u;
		}
	} catch { /* fall through to null */ }
	return null;
}

// -----------------------------------------------------------------------------
// Remark plugin: 双向 handler（parse 走 visit / stringify 走 toMarkdownExtensions）
// -----------------------------------------------------------------------------
function vswordRemarkEmoji() {
	const data = this.data();
	const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
	toMarkdownExtensions.push({
		handlers: {
			emoji(node, _parent, state, info) {
				const tracker = state.createTracker(info);
				return tracker.move(stringifyEmoji(node.name || ''));
			},
		},
		// 不声明 `:` 为 unsafe：CommonMark 里 `:` 无语法意义；把未识别的 `:notreal:`
		// 走 phrasing 输出时若声明 unsafe 会被转义成 `\:notreal\:` 破坏保源码契约。
		// emoji 节点自己以裸 shortcode 输出，不依赖 phrasing recursion，不会自触发。
	});

	return tree => {
		visit(tree, 'text', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const text = node.value;
			if (typeof text !== 'string' || text.length === 0) return;
			EMOJI_RE.lastIndex = 0;
			if (!EMOJI_RE.test(text)) return;
			EMOJI_RE.lastIndex = 0;
			const out = [];
			let cursor = 0;
			let m;
			let replaced = false;
			while ((m = EMOJI_RE.exec(text)) !== null) {
				// 转义门槛：紧邻左侧一个反斜杠视为不匹配（`\:smile:` 保源码）。
				if (m.index > 0 && text[m.index - 1] === '\\') continue;
				const name = m[1];
				const unicode = resolveEmoji(name);
				if (!unicode) continue;   // 未识别兜底：保留文本，不消费。
				if (m.index > cursor) out.push({ type: 'text', value: text.slice(cursor, m.index) });
				out.push({ type: 'emoji', name, unicode });
				cursor = m.index + m[0].length;
				replaced = true;
			}
			if (!replaced) return;
			if (cursor < text.length) out.push({ type: 'text', value: text.slice(cursor) });
			parent.children.splice(index, 1, ...out);
			return index + out.length;
		});
	};
}

export const remarkEmoji = $remark('vsword-remark-emoji', () => vswordRemarkEmoji, {});

// -----------------------------------------------------------------------------
// Schema: inline atom node
// -----------------------------------------------------------------------------
// attrs.name 保存 shortcode，attrs.unicode 保存运行时渲染的 emoji（可选，parseMarkdown 会
// 补齐；toMarkdown 只用 name）。
export const emojiSchema = $nodeSchema('emoji', () => ({
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	attrs: {
		name: { default: '' },
		unicode: { default: '' },
	},
	parseDOM: [{
		tag: 'span.vsword-emoji',
		getAttrs: (dom) => ({
			name: dom.getAttribute('data-emoji-name') || '',
			unicode: dom.textContent || '',
		}),
	}],
	toDOM: (node) => {
		const name = String(node.attrs?.name || '');
		const unicode = String(node.attrs?.unicode || '');
		return ['span', {
			class: 'vsword-emoji',
			'data-emoji-name': name,
			title: `:${name}:`,
			// 让 PM 把 atom 当作单字符选择/退格单位。
			'aria-label': name,
		}, unicode || `:${name}:`];
	},
	parseMarkdown: {
		match: (node) => node.type === 'emoji',
		runner: (state, node, type) => {
			const name = String(node.name || '');
			// 若 mdast 上带了 unicode（走 remark visitor 路径），直接用；
			// 否则（罕见的直接 parse mdast 场景）再查一次表。
			let unicode = typeof node.unicode === 'string' ? node.unicode : '';
			if (!unicode) unicode = resolveEmoji(name) || '';
			state.addNode(type, { name, unicode });
		},
	},
	toMarkdown: {
		match: (mark) => mark.type.name === 'emoji',
		runner: (state, pmNode) => {
			state.addNode('emoji', undefined, undefined, {
				name: String(pmNode.attrs?.name || ''),
			});
		},
	},
}));

// -----------------------------------------------------------------------------
// InputRule: 输入 `:name: `（末尾空格）触发替换
// -----------------------------------------------------------------------------
// PRD F-02：触发字符 = 空格。用 InputRule 正则末尾 `\s`，捕获 `:name:` 部分替换为
// atom node + 一个空格文本（保留用户键入的空格）。
export const emojiInputRule = $inputRule((ctx) => {
	const type = emojiSchema.type(ctx);
	// 使用 lookbehind 排除转义反斜杠 `\:name: `。
	return new InputRule(/(?<!\\):([A-Za-z0-9_+\-]+):\s$/, (state, match, start, end) => {
		const name = match[1];
		const unicode = resolveEmoji(name);
		if (!unicode) return null;                // 未识别 → 让文本原样保留
		const node = type.create({ name, unicode });
		// 保留触发空格：atom + ' '。
		const tr = state.tr.replaceWith(start, end, [node, state.schema.text(' ')]);
		return tr;
	});
});

// -----------------------------------------------------------------------------
// Bundle
// -----------------------------------------------------------------------------
export const emojiPlugins = [
	remarkEmoji,
	emojiSchema,
	emojiInputRule,
].flat();

// re-export for verify.template.mjs 断言
export { resolveEmoji };
