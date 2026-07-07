// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown webview · UI 组件契约（T-3.7b.d）
 *
 *  纯 JSDoc typedef，无运行时代码 —— import 这个文件不会执行任何逻辑，只为其他
 *  webview 模块提供统一的组件形状约定。
 *
 *  IMilkdownUIComponent 契约要求：
 *    - `mount(container)` 在 container 内部找到本组件对应的 DOM，绑事件、把 el 记录到内部状态。
 *    - `unmount()` 只解绑事件，DOM 保留在 container 里（下次 mount 直接接手，不重排 markup）。
 *    - `dispose()` 彻底销毁：先 unmount → 清空 el 引用 → 在 container 上派发
 *      `vsword-ui-component-disposed`（bubbles:true）sentinel event，供单测断言。
 *
 *  关键设计取舍：DOM markup 仍由 `milkdownEditorHtml.ts` 硬编码生成（避免首帧闪烁），
 *  UI 组件只做「event wiring + state 更新」，不负责创建/重排结构。
 *--------------------------------------------------------------------------------------------*/

/**
 * @typedef {Object} IMilkdownUIComponent
 * @property {HTMLElement | null} el       — 组件根元素；mount 后指向 container 内的对应 DOM，dispose 后置 null。
 * @property {(container: HTMLElement) => void} mount    — 绑定事件监听 + 记录 el 引用。
 * @property {() => void} unmount          — 解绑事件监听，但 DOM 与 el 引用保留（下次 mount 复用）。
 * @property {() => void} dispose          — 彻底销毁：unmount + el=null + 派发 sentinel event。
 */

/**
 * Sentinel event 名。dispose() 会在传入 mount() 的 container 上派发一个 bubbles:true
 * 的 CustomEvent，单元测试通过监听这个事件断言 dispose 是否被正确触发。
 * @type {string}
 */
export const VSWORD_UI_COMPONENT_DISPOSED_EVENT = 'vsword-ui-component-disposed';
