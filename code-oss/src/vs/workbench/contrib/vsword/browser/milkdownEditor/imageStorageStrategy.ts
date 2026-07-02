/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * T-3.5.1: pure resolution logic for pasted/dropped image placement.
 *
 * Kept free of VS Code service imports so it can be unit-tested under
 * `test/node/` against fabricated inputs. The contribution wires this into
 * IFileService for real disk writes.
 *
 * Strategy semantics (Q1=a default, a/b/d selectable):
 *   - `assets-shared`   → `<mdParentDir>/assets/<name>`
 *   - `assets-per-file` → `<mdParentDir>/<mdBase>.assets/<name>`
 *   - `same-folder`     → `<mdParentDir>/<name>`
 *
 * Filename policy (Q2=c Typora-style): prefer suggested/original name,
 * dedupe with `-1`, `-2`, … suffix on collisions. `resolveUniqueFileName`
 * takes a `fileExists` predicate so the same function drives tests and the
 * real IFileService.exists check.
 */

export const VSWORD_IMAGE_STRATEGIES = ['assets-shared', 'assets-per-file', 'same-folder'] as const;
export type VswordImageStorageStrategy = typeof VSWORD_IMAGE_STRATEGIES[number];
export const VSWORD_IMAGE_STRATEGY_DEFAULT: VswordImageStorageStrategy = 'assets-shared';
export const VSWORD_IMAGE_STRATEGY_CONFIG = 'vsword.markdown.imageStorageStrategy';

/** Result of computing where an image should live relative to the current .md. */
export interface ResolvedImageLocation {
	/** Directory the image will land in, as path segments relative to the .md file's parent. */
	readonly relativeDirSegments: readonly string[];
	/** Final on-disk filename (after collision dedupe). */
	readonly fileName: string;
	/** Path used inside the markdown image node (`![](…)`), POSIX slashes, no leading `./`. */
	readonly markdownPath: string;
}

const SAFE_CHAR = /[^A-Za-z0-9._\u4e00-\u9fff-]+/g;

/**
 * Turn an arbitrary suggested name into a filesystem-safe basename + extension.
 * Falls back to `image` when no usable stem remains. Extension is inferred
 * from the mime type when the suggested name lacks one.
 */
export function sanitizeImageFileName(suggestedName: string, mime: string): { readonly base: string; readonly ext: string } {
	const trimmed = (suggestedName ?? '').replace(/^.*[\\/]/, '').trim();
	const dot = trimmed.lastIndexOf('.');
	const rawStem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
	const rawExt = dot > 0 ? trimmed.slice(dot + 1) : '';
	const base = (rawStem.replace(SAFE_CHAR, '-').replace(/^-+|-+$/g, '') || 'image').slice(0, 80);
	const extFromName = rawExt.replace(SAFE_CHAR, '').toLowerCase();
	const ext = (extFromName || mimeToExt(mime) || 'png').slice(0, 8);
	return { base, ext };
}

function mimeToExt(mime: string): string {
	switch ((mime || '').toLowerCase()) {
		case 'image/png': return 'png';
		case 'image/jpeg':
		case 'image/jpg': return 'jpg';
		case 'image/gif': return 'gif';
		case 'image/webp': return 'webp';
		case 'image/svg+xml': return 'svg';
		case 'image/bmp': return 'bmp';
		case 'image/avif': return 'avif';
		default: return '';
	}
}

/** Compute the storage subdirectory (relative to the .md parent) for a given strategy. */
export function resolveRelativeDirSegments(strategy: VswordImageStorageStrategy, mdBaseNameNoExt: string): readonly string[] {
	switch (strategy) {
		case 'assets-shared':   return ['assets'];
		case 'assets-per-file': return [`${sanitizeAssetsDirName(mdBaseNameNoExt)}.assets`];
		case 'same-folder':     return [];
	}
}

function sanitizeAssetsDirName(name: string): string {
	// Preserve the same casing/CJK as the source .md filename, only replacing
	// filesystem-hostile chars. Empty fallback keeps things valid.
	const cleaned = (name || '').replace(SAFE_CHAR, '-').replace(/^-+|-+$/g, '');
	return cleaned || 'image';
}

/**
 * Given a desired {base, ext}, append `-1`, `-2`, … until `fileExists(name)`
 * returns false. Bounded by `maxAttempts` (default 1000) to avoid infinite
 * loops if the predicate is misbehaving.
 */
export async function resolveUniqueFileName(
	base: string,
	ext: string,
	relativeDirSegments: readonly string[],
	fileExists: (fileName: string) => Promise<boolean>,
	maxAttempts = 1000,
): Promise<string> {
	const _ = relativeDirSegments; // dir is baked into the predicate by the caller
	const first = `${base}.${ext}`;
	if (!(await fileExists(first))) return first;
	for (let i = 1; i < maxAttempts; i++) {
		const candidate = `${base}-${i}.${ext}`;
		if (!(await fileExists(candidate))) return candidate;
	}
	// Extremely unlikely fallback; use a timestamp so the write still succeeds.
	return `${base}-${Date.now()}.${ext}`;
}

/**
 * End-to-end resolver used by the contribution: sanitise → strategy → dedupe.
 * Returns everything callers need to write the file AND insert the markdown.
 */
export async function resolveImageLocation(
	strategy: VswordImageStorageStrategy,
	mdBaseNameNoExt: string,
	suggestedName: string,
	mime: string,
	fileExistsInDir: (fileName: string) => Promise<boolean>,
): Promise<ResolvedImageLocation> {
	const { base, ext } = sanitizeImageFileName(suggestedName, mime);
	const relativeDirSegments = resolveRelativeDirSegments(strategy, mdBaseNameNoExt);
	const fileName = await resolveUniqueFileName(base, ext, relativeDirSegments, fileExistsInDir);
	const markdownPath = [...relativeDirSegments, fileName].join('/');
	return { relativeDirSegments, fileName, markdownPath };
}

/** Runtime guard used by the contribution + config resolver. */
export function isValidImageStrategy(v: unknown): v is VswordImageStorageStrategy {
	return typeof v === 'string' && (VSWORD_IMAGE_STRATEGIES as readonly string[]).includes(v);
}
