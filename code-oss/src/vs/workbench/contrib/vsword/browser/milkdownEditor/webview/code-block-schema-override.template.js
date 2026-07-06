// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  T-3.5c.5 · code_block schema override —— fence info meta 保真。
 *
 *  目的（PRD F-21）：
 *    ```js {highlight-lines=[1,3]}
 *    code
 *    ```
 *  被 remark 解析为 mdast code node.lang='js' + node.meta='{highlight-lines=[1,3]}'。
 *  上游 @milkdown/preset-commonmark 的 codeBlockSchema 只把 lang 灌到 attrs.language，
 *  meta 直接丢；stringify 阶段 mdast-util-to-markdown 会读 node.meta，但只要
 *  toMarkdown runner 不写 meta，产物就没有 meta 段。
 *
 *  修法（同 id 后覆盖，与 image-schema-override 同模式）：
 *    - attrs 新增 `meta: string`（默认 ''）
 *    - parseDOM: 从 `pre[data-meta]` 读回 meta（NodeView 侧不会渲染 data-meta，此项主要防
 *      HTML 粘贴/paste pipeline 保留能力，实际 markdown 路径走 parseMarkdown）。
 *    - toDOM: 若 meta 非空则输出 data-meta，方便 e2e debug；不影响 Prism 高亮（只读 language）。
 *    - parseMarkdown: 从 mdast node.meta 读入 attrs.meta。
 *    - toMarkdown: 写回 mdast node.meta（remark-stringify 的 code handler 自动拼头行）。
 *
 *  白名单排除：language==='mermaid' 时 meta 语义无实际用途（mermaid NodeView 只消费源码本身），
 *  但保留 attrs.meta 与其他 code_block 同规则，无需特判：mermaid 源码里通常没有 fence meta，
 *  即便有也按同一 pipeline 忠实回写。
 *
 *  注册顺序（entry.template.js）：`.use(commonmark).use(codeBlockSchemaOverride)`，
 *  同 name 后 use 覆盖前 use（image-schema-override 已验证）。
 *--------------------------------------------------------------------------------------------*/

import { $nodeSchema } from '@milkdown/utils';
import { expectDomTypeError } from '@milkdown/exception';

export const codeBlockSchemaOverride = $nodeSchema('code_block', () => ({
	content: 'text*',
	group: 'block',
	marks: '',
	defining: true,
	code: true,
	attrs: {
		language: { default: '', validate: 'string' },
		// T-3.5c.5: fence info meta，例如 ```js {highlight-lines=[1,3]}``` 里的
		// `{highlight-lines=[1,3]}` 段。空串 = 无 meta。
		meta: { default: '', validate: 'string' },
	},
	parseDOM: [
		{
			tag: 'pre',
			preserveWhitespace: 'full',
			getAttrs: (dom) => {
				if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom);
				return {
					language: dom.dataset.language || '',
					meta: dom.dataset.meta || '',
				};
			},
		},
	],
	toDOM: (node) => {
		const { language, meta } = node.attrs;
		const preAttrs = {};
		if (language && language.length > 0) preAttrs['data-language'] = language;
		if (meta && meta.length > 0) preAttrs['data-meta'] = meta;
		return ['pre', preAttrs, ['code', 0]];
	},
	parseMarkdown: {
		match: ({ type }) => type === 'code',
		runner: (state, node, type) => {
			state.openNode(type, {
				language: node.lang ?? '',
				meta: typeof node.meta === 'string' ? node.meta : '',
			});
			const value = node.value;
			if (typeof value === 'string' && value.length > 0) {
				state.addText(value);
			}
			state.closeNode();
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'code_block',
		runner: (state, node) => {
			const text = node.content.firstChild?.text || '';
			const attrs = {
				lang: node.attrs.language || null,
			};
			const meta = node.attrs.meta;
			if (typeof meta === 'string' && meta.length > 0) {
				attrs.meta = meta;
			}
			state.addNode('code', undefined, text, attrs);
		},
	},
}));
