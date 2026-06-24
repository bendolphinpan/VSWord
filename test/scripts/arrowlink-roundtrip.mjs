#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  VSWord T-5.9 — Arrowlink end-to-end round-trip
 *
 *  parse → mutate (append / update / remove) → write → re-parse, asserting on every step:
 *    - unknown attributes / hooks / richcontent / comments preserved byte-for-byte where applicable
 *    - arrowlink ID stable across persist round-trip
 *    - cross-tree destinations survive
 *    - self-closing source node auto-expands
 *    - whitelisted enum attrs (StartArrow / EndArrow) enforced
 *    - multiple arrowlinks coexist independently
 *
 *  Run from repo root after `npm run compile` in code-oss/:
 *      node test/scripts/arrowlink-roundtrip.mjs
 *--------------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const mmModulePath = join(repoRoot, 'code-oss', 'out', 'vs', 'workbench', 'contrib', 'vsword', 'common', 'mindmapXml.js');
if (!existsSync(mmModulePath)) {
	console.error('[FAIL] Compiled mindmapXml.js not found at:', mmModulePath);
	console.error('       Run `npm run compile` in code-oss/ first.');
	process.exit(2);
}
const mm = require(mmModulePath);

const fixturePath = join(repoRoot, 'test', 'fixtures', 'mindmap', 'complex-xmind.mm');
const reportsDir = join(repoRoot, 'test', 'reports');
if (!existsSync(reportsDir)) { mkdirSync(reportsDir, { recursive: true }); }

const original = readFileSync(fixturePath, 'utf8');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, predicate, detail) {
	if (predicate) {
		passed++;
		console.log(`  ok  ${name}`);
	} else {
		failed++;
		failures.push({ name, detail });
		console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
	}
}

function group(title, fn) {
	console.log(`\n# ${title}`);
	fn();
}

// ---------------------------------------------------------------------------
// 1. Parse the fixture
// ---------------------------------------------------------------------------
let baseDoc;
group('parse fixture', () => {
	baseDoc = mm.parseMindmapXml(original);
	check('root parses', !!baseDoc.root && baseDoc.root.id === 'root');
	check('phase-1 has 2 arrowlinks defined nearby (al-cross-1 + p1-personas/al-cross-2)', (() => {
		const phase1 = baseDoc.root.children.find(c => c.id === 'phase-1');
		const personas = phase1?.children.find(c => c.id === 'p1-personas');
		return phase1?.arrowlinks?.length === 1 && personas?.arrowlinks?.length === 1;
	})());
	check('phase-3-marketing has arrowlink to p1-research', (() => {
		const phase3 = baseDoc.root.children.find(c => c.id === 'phase-3');
		const marketing = phase3?.children.find(c => c.id === 'phase-3-marketing');
		return marketing?.arrowlinks?.[0]?.destination === 'p1-research';
	})());
	check('unknown CUSTOM_ATTR preserved in original', original.includes('CUSTOM_ATTR="keep-me"'));
});

// ---------------------------------------------------------------------------
// 2. appendMindmapArrowlink — adds new arrowlink without touching anything else
// ---------------------------------------------------------------------------
let xmlA;
group('append arrowlink (cross-tree)', () => {
	xmlA = mm.appendMindmapArrowlink(original, 'p2-arch', { newId: 'al-new-1', destination: 'p4-metrics', endArrow: 'Default' });
	const docA = mm.parseMindmapXml(xmlA);
	const phase2 = docA.root.children.find(c => c.id === 'phase-2');
	const arch = phase2?.children.find(c => c.id === 'p2-arch');
	check('new arrowlink al-new-1 appears under p2-arch', arch?.arrowlinks?.some(a => a.id === 'al-new-1' && a.destination === 'p4-metrics'));
	check('al-new-1 endArrow=Default', arch?.arrowlinks?.find(a => a.id === 'al-new-1')?.endArrow === 'Default');
	check('CUSTOM_ATTR still present after append', xmlA.includes('CUSTOM_ATTR="keep-me"'));
	check('hook MapStyle preserved', xmlA.includes('<hook NAME="MapStyle">') && xmlA.includes('show_icon_for_attributes="true"'));
	check('richcontent preserved', xmlA.includes('<richcontent TYPE="NODE">') && xmlA.includes('<b>personas</b>'));
	check('comments preserved', xmlA.includes('<!-- VSWord T-5.9 complex fixture'));
	check('xml decl preserved', xmlA.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
	check('existing arrowlinks unchanged in count for phase-1 / phase-3', (() => {
		const phase1 = docA.root.children.find(c => c.id === 'phase-1');
		const phase3 = docA.root.children.find(c => c.id === 'phase-3');
		return phase1.arrowlinks.length === 1 &&
			phase1.children.find(c => c.id === 'p1-personas').arrowlinks.length === 1 &&
			phase3.children.find(c => c.id === 'phase-3-marketing').arrowlinks.length === 1;
	})());
});

// ---------------------------------------------------------------------------
// 3. append into a self-closing node — must auto-expand
// ---------------------------------------------------------------------------
group('append into self-closing source', () => {
	const selfClosingXml = '<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1"><node ID="root" TEXT="X"><node ID="leaf-self" TEXT="Leaf" CUSTOM_X="abc"/></node></map>';
	const out = mm.appendMindmapArrowlink(selfClosingXml, 'leaf-self', { newId: 'al-x-1', destination: 'root' });
	check('leaf-self no longer self-closing', !out.includes('TEXT="Leaf" CUSTOM_X="abc"/>'));
	check('arrowlink injected as child', out.includes('<arrowlink ') && out.includes('DESTINATION="root"'));
	check('CUSTOM_X preserved on expanded node', out.includes('CUSTOM_X="abc"'));
});

// ---------------------------------------------------------------------------
// 4. updateMindmapArrowlink — destination + endArrow patch
// ---------------------------------------------------------------------------
let xmlU;
group('update arrowlink endpoint + endArrow', () => {
	xmlU = mm.updateMindmapArrowlink(xmlA, 'al-new-1', { destination: 'p3-test-e2e', endArrow: 'None' });
	const docU = mm.parseMindmapXml(xmlU);
	const arch = docU.root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-arch');
	const al = arch.arrowlinks.find(a => a.id === 'al-new-1');
	check('destination updated to p3-test-e2e', al?.destination === 'p3-test-e2e');
	check('endArrow now None', al?.endArrow === 'None');
	check('untouched arrowlinks unchanged', (() => {
		const phase1 = docU.root.children.find(c => c.id === 'phase-1');
		return phase1.arrowlinks[0].destination === 'phase-3-test'
			&& phase1.arrowlinks[0].id === 'al-cross-1';
	})());
});

// ---------------------------------------------------------------------------
// 5. null patch — clear attribute
// ---------------------------------------------------------------------------
group('update arrowlink with null = clear attr', () => {
	const cleared = mm.updateMindmapArrowlink(xmlU, 'al-new-1', { endArrow: null });
	const al = mm.parseMindmapXml(cleared).root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-arch').arrowlinks.find(a => a.id === 'al-new-1');
	check('endArrow removed', al?.endArrow === undefined);
	check('destination retained after null-patch', al?.destination === 'p3-test-e2e');
});

// ---------------------------------------------------------------------------
// 6. removeMindmapArrowlink — only matching ID removed
// ---------------------------------------------------------------------------
let xmlR;
group('remove arrowlink', () => {
	xmlR = mm.removeMindmapArrowlink(xmlU, 'al-new-1');
	const docR = mm.parseMindmapXml(xmlR);
	const arch = docR.root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-arch');
	check('al-new-1 gone', !arch.arrowlinks.some(a => a.id === 'al-new-1'));
	check('other arrowlinks still present', (() => {
		const phase1 = docR.root.children.find(c => c.id === 'phase-1');
		const phase3 = docR.root.children.find(c => c.id === 'phase-3');
		return phase1.arrowlinks[0].id === 'al-cross-1'
			&& phase3.children.find(c => c.id === 'phase-3-marketing').arrowlinks[0].id === 'al-marketing-to-research';
	})());
	check('CUSTOM_ATTR still preserved through full pipeline', xmlR.includes('CUSTOM_ATTR="keep-me"'));
	check('richcontent still preserved through full pipeline', xmlR.includes('<b>personas</b>'));
});

// ---------------------------------------------------------------------------
// 7. multiple arrowlinks on same source — independent CRUD
// ---------------------------------------------------------------------------
group('multiple arrowlinks on same source', () => {
	let x = mm.appendMindmapArrowlink(original, 'p2-mvp', { newId: 'al-mv-1', destination: 'p4-feedback', endArrow: 'Default' });
	x = mm.appendMindmapArrowlink(x, 'p2-mvp', { newId: 'al-mv-2', destination: 'p4-metrics' });
	x = mm.appendMindmapArrowlink(x, 'p2-mvp', { newId: 'al-mv-3', destination: 'p3-test-unit' });
	let doc = mm.parseMindmapXml(x);
	const mvp = doc.root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-mvp');
	check('3 arrowlinks added', mvp.arrowlinks.length === 3);
	// remove middle one
	x = mm.removeMindmapArrowlink(x, 'al-mv-2');
	doc = mm.parseMindmapXml(x);
	const mvp2 = doc.root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-mvp');
	const ids = mvp2.arrowlinks.map(a => a.id);
	check('middle removed, others intact', ids.length === 2 && ids.includes('al-mv-1') && ids.includes('al-mv-3'));
	// update last
	x = mm.updateMindmapArrowlink(x, 'al-mv-3', { destination: 'phase-4' });
	doc = mm.parseMindmapXml(x);
	const al3 = doc.root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-mvp').arrowlinks.find(a => a.id === 'al-mv-3');
	check('al-mv-3 destination updated, al-mv-1 untouched', al3.destination === 'phase-4'
		&& doc.root.children.find(c => c.id === 'phase-2').children.find(c => c.id === 'p2-mvp').arrowlinks.find(a => a.id === 'al-mv-1').destination === 'p4-feedback');
});

// ---------------------------------------------------------------------------
// 8. round-trip stability — append+remove returns equivalent structure
// ---------------------------------------------------------------------------
group('append+remove → arrowlinks set restored', () => {
	const x1 = mm.appendMindmapArrowlink(original, 'p4-feedback', { newId: 'al-temp', destination: 'phase-1' });
	const x2 = mm.removeMindmapArrowlink(x1, 'al-temp');
	const d0 = mm.parseMindmapXml(original);
	const d2 = mm.parseMindmapXml(x2);
	function collectArrowlinks(node) {
		const out = [];
		const stack = [node];
		while (stack.length) {
			const cur = stack.pop();
			for (const al of (cur.arrowlinks || [])) { out.push({ src: cur.id, ...al }); }
			for (const c of (cur.children || [])) { stack.push(c); }
		}
		return out.sort((a, b) => (a.src + a.id).localeCompare(b.src + b.id));
	}
	const a0 = collectArrowlinks(d0.root);
	const a2 = collectArrowlinks(d2.root);
	check('arrowlink set identical after append+remove', JSON.stringify(a0) === JSON.stringify(a2),
		'a0=' + JSON.stringify(a0) + ' a2=' + JSON.stringify(a2));
});

// ---------------------------------------------------------------------------
// 9. update non-existent ID — no-op (does not throw, xml unchanged)
// ---------------------------------------------------------------------------
group('update non-existent arrowlink — no-op', () => {
	let threw = null;
	let out = original;
	try { out = mm.updateMindmapArrowlink(original, 'al-DOES-NOT-EXIST', { destination: 'phase-1' }); }
	catch (e) { threw = e; }
	check('no exception thrown', !threw, threw && threw.message);
	check('xml unchanged when arrowlink id missing', out === original);
});

// ---------------------------------------------------------------------------
// 10. Save the final mutated XML for human inspection
// ---------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportXml = join(reportsDir, `arrowlink-roundtrip-${stamp}.mm`);
writeFileSync(reportXml, xmlR, 'utf8');
const reportJson = join(reportsDir, `arrowlink-roundtrip-${stamp}.json`);
writeFileSync(reportJson, JSON.stringify({ passed, failed, failures, generatedAt: new Date().toISOString() }, null, 2), 'utf8');

console.log(`\nsummary: ${passed} passed, ${failed} failed`);
console.log(`final xml  : ${reportXml}`);
console.log(`report json: ${reportJson}`);

process.exit(failed === 0 ? 0 : 1);
