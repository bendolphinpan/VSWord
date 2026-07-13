// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown theme constants (T-3.3.1) — JS mirror of milkdownEditorThemes.ts.
 *
 *  The TS file owns the actual CSS blob (getThemesCss) that is inlined into the webview HTML
 *  server-side. This JS module carries only the id list + default so the webview bundle and
 *  verify sandbox can validate incoming `themeChanged` payloads without needing to import
 *  the TS host module.
 *
 *  KEEP IN SYNC WITH milkdownEditorThemes.ts (VSWORD_MILKDOWN_THEME_IDS + DEFAULT).
 *--------------------------------------------------------------------------------------------*/

export const VSWORD_MILKDOWN_THEME_IDS = Object.freeze([
	'paper',
	'default',
	'github',
	'newsprint',
	'night',
	'solarized-light',
]);

/** Product default: light writing surface (does not follow workbench dark shell). */
export const VSWORD_MILKDOWN_DEFAULT_THEME = 'paper';

export function isValidTheme(id) {
	return typeof id === 'string' && VSWORD_MILKDOWN_THEME_IDS.includes(id);
}
