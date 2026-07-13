// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown 视图模式 · editable 切换器（T-3.7b.c）。
 *
 *  职责：把 view-mode 一维状态映射到 Milkdown EditorView 的 editable 属性。
 *  `reading` → editable = false（纯只读）；其余模式 → editable = true。
 *
 *  三条硬约束（对齐 PRD §4.2 + AC-2 / AC-6）：
 *    1) editable 传函数而不是 boolean —— Milkdown/ProseMirror 每次 focus/keydown 都调用
 *       它取当前值，boolean 会被 EditorView 缓存住老值。
 *    2) 同步更新 editorViewOptionsCtx 让**未来重建**的 EditorView 拿到新函数；同时对
 *       活体 view 调 `setProps({ editable: fn })` 立即生效。
 *    3) IME composition 中途切 reading 会残半吊子输入 —— 用一次空 tr dispatch 强制
 *       ProseMirror flush composition，再交给新的 editable 门禁。
 *
 *  sessionReady 双闸门：`createEditor` 未跑完前调 apply 会踩空 ctx 或抛 InitReady 未就绪。
 *  applier 内部把待生效 mode 塞进 `pendingMode`；host 侧一旦 setSessionReady(true) 立即 replay。
 *
 *  单测面向：把 editorViewCtx / editorViewOptionsCtx 当**不透明 slice 句柄**由外部注入，
 *  applier 本身不 import 任何 @milkdown/* —— 这样 jsdom 单测可以拿 Symbol 冒充 ctx key。
 *--------------------------------------------------------------------------------------------*/

export const READING = 'reading';

/**
 * @typedef {Object} ApplierDeps
 * @property {() => any} getEditor              返回当前 Milkdown Editor 实例（可能未就绪 → null / undefined）
 * @property {any} editorViewCtx                Milkdown editorViewCtx slice
 * @property {any} editorViewOptionsCtx         Milkdown editorViewOptionsCtx slice
 * @property {(msg: string, err?: unknown) => void} [log]  可选日志钩子
 */

/**
 * @typedef {Object} Applier
 * @property {(mode: string) => void} apply
 * @property {(ready: boolean) => void} setSessionReady
 * @property {() => boolean} isSessionReady
 * @property {() => string | null} getPending
 * @property {() => string | null} getLastApplied
 */

/**
 * 建立一个视图模式 → editable 切换器。
 * @param {ApplierDeps} deps
 * @returns {Applier}
 */
export function createViewModeApplier(deps) {
	const getEditor = typeof deps?.getEditor === 'function' ? deps.getEditor : () => null;
	const viewCtx = deps?.editorViewCtx;
	const optionsCtx = deps?.editorViewOptionsCtx;
	const log = typeof deps?.log === 'function' ? deps.log : () => { };

	let sessionReady = false;
	let pendingMode = /** @type {string | null} */(null);
	let lastAppliedMode = /** @type {string | null} */(null);

	function editableFor(mode) {
		return () => mode !== READING;
	}

	function apply(mode) {
		if (typeof mode !== 'string' || mode.length === 0) return;
		if (!sessionReady) {
			pendingMode = mode;
			return;
		}
		const editor = getEditor();
		if (!editor || typeof editor.action !== 'function') {
			// editor 还没就位（例如正在 destroy → recreate 的空档）→ 挂 pending 等下次 replay。
			pendingMode = mode;
			return;
		}
		const editable = editableFor(mode);
		try {
			editor.action((ctx) => {
				// 1) 更新 slice —— 让 Milkdown 后续重建 EditorView 时也能拿到新 editable。
				if (optionsCtx && typeof ctx?.update === 'function') {
					try {
						ctx.update(optionsCtx, (prev) => ({
							...(prev || {}),
							editable,
						}));
					} catch (err) {
						log('editorViewOptionsCtx update failed', err);
					}
				}
				// 2) 直接改活体 view，立即生效不用等下一轮重建。
				let view = null;
				try {
					if (viewCtx && typeof ctx?.get === 'function') {
						view = ctx.get(viewCtx);
					}
				} catch (err) {
					log('editorViewCtx get failed', err);
					view = null;
				}
				if (view && typeof view.setProps === 'function') {
					try {
						view.setProps({ editable });
					} catch (err) {
						log('view.setProps failed', err);
					}
					// 3) IME composition flush —— 空 tr dispatch 强制 ProseMirror 结束 composing
					// 状态，避免半吊子输入残留（AC-6）。
					if (view.state && typeof view.dispatch === 'function') {
						try {
							view.dispatch(view.state.tr);
						} catch (err) {
							log('view.dispatch flush failed', err);
						}
					}
					// 4) 切回可编辑模式后强制 focus，恢复 caret（用户反馈：切模式后有焦无指针）
					if (mode !== READING && typeof view.focus === 'function') {
						try {
							view.focus();
						} catch (err) {
							log('view.focus failed', err);
						}
					}
				}
			});
			lastAppliedMode = mode;
		} catch (err) {
			log('applyViewMode outer error', err);
		}
	}

	function setSessionReady(ready) {
		const next = !!ready;
		if (next === sessionReady) return;
		sessionReady = next;
		if (sessionReady && pendingMode !== null) {
			const replay = pendingMode;
			pendingMode = null;
			apply(replay);
		}
	}

	return {
		apply,
		setSessionReady,
		isSessionReady: () => sessionReady,
		getPending: () => pendingMode,
		getLastApplied: () => lastAppliedMode,
	};
}
