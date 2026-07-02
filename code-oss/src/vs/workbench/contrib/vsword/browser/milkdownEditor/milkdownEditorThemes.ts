/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown themes (T-3.3.1).
 *
 *  Four inlined presets:
 *    - github          : light, technical, GitHub sans-serif
 *    - newsprint       : light, editorial, serif newspaper feel
 *    - night           : dark, muted, Typora signature warm-dark
 *    - solarized-light : light, retro, Ethan Schoonover palette
 *
 *  Applied by setting `<body data-theme="<name>">`. Selecting `default` restores the
 *  workbench-tracking behaviour (no data-theme attribute).
 *
 *  All theme overrides tweak the `--vsword-*` token layer defined in :root. New tokens
 *  introduced here (font, line-height, max-width, heading scale) apply to every theme
 *  through the base layer, so a new theme only needs to override what differs.
 *--------------------------------------------------------------------------------------------*/

/** Canonical theme ids. Keep in sync with the enum literals in the contribution + Settings. */
export const VSWORD_MILKDOWN_THEME_IDS = ['default', 'github', 'newsprint', 'night', 'solarized-light'] as const;
export type VswordMilkdownTheme = typeof VSWORD_MILKDOWN_THEME_IDS[number];

/** Storage key for the last user-selected theme id (APPLICATION scope). */
export const VSWORD_MILKDOWN_THEME_STORAGE_KEY = 'vsword.milkdown.lastTheme';

/** Default theme when the store is empty (workbench-tracking, no overrides). */
export const VSWORD_MILKDOWN_DEFAULT_THEME: VswordMilkdownTheme = 'default';

/** Configuration section keys — mirrored in the workbench configuration contribution. */
export const VSWORD_THEME_CONFIG = {
	followWorkbench: 'vsword.theme.followWorkbench',
	light: 'vsword.theme.light',
	dark: 'vsword.theme.dark',
} as const;

export function isValidTheme(id: string | undefined | null): id is VswordMilkdownTheme {
	return typeof id === 'string' && (VSWORD_MILKDOWN_THEME_IDS as readonly string[]).includes(id);
}

/**
 * CSS block emitted inside the webview <style>. Selectors are scoped to
 * `body[data-theme="…"]` so the base `:root` values remain the fallback for
 * `data-theme="default"` or missing attribute.
 */
export function getThemesCss(): string {
	return `
		/* T-3.3.1 shared tokens — extend the base :root layer. */
		:root {
			--vsword-font-serif: "Charter", "Bitstream Charter", "Iowan Old Style", Georgia, "Times New Roman", serif;
			--vsword-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
			--vsword-max-width: 860px;
			--vsword-body-font: var(--vsword-font-sans);
			--vsword-body-size: 15px;
			--vsword-body-line: 1.65;
			--vsword-heading-font: inherit;
			--vsword-heading-weight: 600;
			--vsword-link: var(--vsword-accent);
			--vsword-quote-bar: color-mix(in srgb, var(--vsword-accent) 40%, transparent);
			--vsword-code-bg: color-mix(in srgb, var(--vsword-bg) 82%, var(--vsword-fg));
			--vsword-pre-bg: color-mix(in srgb, var(--vsword-bg) 88%, var(--vsword-fg));
			--vsword-table-stripe: transparent;
			--vsword-table-header-bg: color-mix(in srgb, var(--vsword-bg) 90%, var(--vsword-fg));
		}
		/* Apply layered tokens on the editor surface. */
		#milkdown-root .ProseMirror {
			font-family: var(--vsword-body-font);
			font-size: var(--vsword-body-size);
			line-height: var(--vsword-body-line);
		}
		#milkdown-root .ProseMirror h1,
		#milkdown-root .ProseMirror h2,
		#milkdown-root .ProseMirror h3,
		#milkdown-root .ProseMirror h4,
		#milkdown-root .ProseMirror h5,
		#milkdown-root .ProseMirror h6 { font-family: var(--vsword-heading-font); font-weight: var(--vsword-heading-weight); }
		#milkdown-root .ProseMirror a { color: var(--vsword-link); }
		#milkdown-root .ProseMirror blockquote {
			border-left: 3px solid var(--vsword-quote-bar);
			padding-left: 1em;
			color: var(--vsword-muted);
		}
		#milkdown-root .ProseMirror code { background: var(--vsword-code-bg); }
		#milkdown-root .ProseMirror pre { background: var(--vsword-pre-bg); }
		#milkdown-root .ProseMirror table tr:nth-child(2n) td { background: var(--vsword-table-stripe); }
		#milkdown-root .ProseMirror table th { background: var(--vsword-table-header-bg); }

		/* -------- GitHub (light, technical) -------- */
		body[data-theme="github"] {
			--vsword-bg: #ffffff;
			--vsword-fg: #24292f;
			--vsword-muted: #57606a;
			--vsword-border: #d0d7de;
			--vsword-accent: #0969da;
			--vsword-link: #0969da;
			--vsword-body-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
			--vsword-body-size: 16px;
			--vsword-body-line: 1.6;
			--vsword-quote-bar: #d0d7de;
			--vsword-code-bg: rgba(175, 184, 193, 0.2);
			--vsword-pre-bg: #f6f8fa;
			--vsword-table-stripe: #f6f8fa;
			--vsword-table-header-bg: #f6f8fa;
			color-scheme: light;
		}

		/* -------- Newsprint (light, editorial serif) -------- */
		body[data-theme="newsprint"] {
			--vsword-bg: #fbf9f4;
			--vsword-fg: #2b2b2b;
			--vsword-muted: #7d7367;
			--vsword-border: #d9d1c1;
			--vsword-accent: #8f2b2b;
			--vsword-link: #8f2b2b;
			--vsword-body-font: var(--vsword-font-serif);
			--vsword-heading-font: var(--vsword-font-serif);
			--vsword-heading-weight: 700;
			--vsword-body-size: 17px;
			--vsword-body-line: 1.7;
			--vsword-max-width: 720px;
			--vsword-quote-bar: #c9a86a;
			--vsword-code-bg: #efe9dc;
			--vsword-pre-bg: #efe9dc;
			--vsword-table-header-bg: #efe9dc;
			color-scheme: light;
		}

		/* -------- Night (dark, warm, Typora signature) -------- */
		body[data-theme="night"] {
			--vsword-bg: #363636;
			--vsword-fg: #b8b8b8;
			--vsword-muted: #8a8a8a;
			--vsword-border: #4a4a4a;
			--vsword-accent: #d1a54b;
			--vsword-link: #d1a54b;
			--vsword-body-size: 15px;
			--vsword-body-line: 1.7;
			--vsword-quote-bar: #6c6c6c;
			--vsword-code-bg: #2f2f2f;
			--vsword-pre-bg: #2f2f2f;
			--vsword-table-header-bg: #2f2f2f;
			color-scheme: dark;
		}

		/* -------- Solarized Light (retro programmer) -------- */
		body[data-theme="solarized-light"] {
			--vsword-bg: #fdf6e3;
			--vsword-fg: #586e75;
			--vsword-muted: #93a1a1;
			--vsword-border: #eee8d5;
			--vsword-accent: #268bd2;
			--vsword-link: #268bd2;
			--vsword-body-size: 15px;
			--vsword-body-line: 1.65;
			--vsword-quote-bar: #93a1a1;
			--vsword-code-bg: #eee8d5;
			--vsword-pre-bg: #eee8d5;
			--vsword-table-stripe: #f5efd6;
			--vsword-table-header-bg: #eee8d5;
			color-scheme: light;
		}

		/* Center the content column at the theme-specified max width. */
		#milkdown-root, #milkdown-source {
			padding-left: max(24px, calc((100vw - var(--vsword-max-width)) / 2));
			padding-right: max(24px, calc((100vw - var(--vsword-max-width)) / 2));
		}
	`;
}
