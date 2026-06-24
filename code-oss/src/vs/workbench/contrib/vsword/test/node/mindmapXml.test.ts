/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { join, resolve } from '../../../../../base/common/path.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { addMindmapNodeIcon, appendMindmapArrowlink, appendMindmapChild, appendMindmapSibling, parseMindmapXml, removeMindmapArrowlink, removeMindmapNode, removeMindmapNodeIcon, serializeMindmapXml, setMindmapNodeBackgroundColor, setMindmapNodeColor, setMindmapNodeEdge, setMindmapNodeFolded, setMindmapNodeFont, updateMindmapArrowlink, updateMindmapNodeText } from '../../common/mindmapXml.js';

suite('VSWord Mindmap XML', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function readFixture(name: string): string {
		const fixturesOutDir = FileAccess.asFileUri('vs/workbench/contrib/vsword/test/fixtures/mindmap').fsPath;
		const fixturesSrcDir = resolve(fixturesOutDir).replaceAll('\\\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		return readFileSync(join(fixturesSrcDir, name), 'utf8');
	}

	test('parses FreeMind nodes and known attributes', () => {
		const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1"><node ID="root" TEXT="Book"><node ID="chapter-1" TEXT="Chapter 1" POSITION="left" FOLDED="true" LINK="notes.md" COLOR="#ff0000" BACKGROUND_COLOR="#ffffff"><icon BUILTIN="full-1" /></node></node></map>';

		const doc = parseMindmapXml(xml);

		assert.strictEqual(doc.root?.id, 'root');
		assert.strictEqual(doc.root?.text, 'Book');
		assert.strictEqual(doc.root?.children.length, 1);
		assert.strictEqual(doc.root?.children[0].id, 'chapter-1');
		assert.strictEqual(doc.root?.children[0].side, 'left');
		assert.strictEqual(doc.root?.children[0].folded, true);
		assert.strictEqual(doc.root?.children[0].link, 'notes.md');
		assert.strictEqual(doc.root?.children[0].color, '#ff0000');
		assert.strictEqual(doc.root?.children[0].backgroundColor, '#ffffff');
		assert.deepStrictEqual(doc.root?.children[0].icons, ['full-1']);
	});

	test('serializes unchanged XML byte-for-byte for unknown content preservation', () => {
		const xml = '<?xml version="1.0"?>\n<!-- keep -->\n<map version="1.0.1"><node ID="root" TEXT="Root" CREATED="1"><hook NAME="MapStyle"><properties show_icon_for_attributes="true" /></hook><node ID="child" TEXT="Child"><cloud COLOR="#cccccc" /></node></node></map>';

		const doc = parseMindmapXml(xml);

		assert.strictEqual(serializeMindmapXml(doc), xml);
	});

	test('updates one TEXT attribute without dropping unknown XML', () => {
		const xml = '<?xml version="1.0"?>\n<map version="1.0.1"><node ID="root" TEXT="Root" CREATED="1"><node ID="child" TEXT="Old &amp; Value"><hook NAME="ExternalObject" URI="file.png" /></node></node></map>';

		const updated = updateMindmapNodeText(xml, 'child', 'New <Value> & Draft');

		assert.strictEqual(updated, '<?xml version="1.0"?>\n<map version="1.0.1"><node ID="root" TEXT="Root" CREATED="1"><node ID="child" TEXT="New &lt;Value&gt; &amp; Draft"><hook NAME="ExternalObject" URI="file.png" /></node></node></map>');
	});

	test('round-trips Gate F fixtures without byte changes', () => {
		for (const name of ['freemind-basic.mm', 'freemind-icons.mm', 'richcontent.mm', 'unknown-attrs.mm', 'unknown-children.mm', 'large-1k-nodes.mm', 'xmind-exported.mm']) {
			const xml = readFixture(name);
			assert.strictEqual(serializeMindmapXml(parseMindmapXml(xml)), xml, name);
		}
	});

	test('parses large fixture without losing direct children', () => {
		const doc = parseMindmapXml(readFixture('large-1k-nodes.mm'));

		assert.strictEqual(doc.root?.children.length, 1000);
		assert.strictEqual(doc.root?.children[0].text, 'Node 1');
		assert.strictEqual(doc.root?.children[999].text, 'Node 1000');
	});

	test('appendMindmapChild inserts as last child of an open node', () => {
		const xml = '<?xml version="1.0"?>\n<map version="1.0.1"><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/><node ID="b" TEXT="B"/></node></map>';

		const updated = appendMindmapChild(xml, 'root', { newId: 'c', text: 'C' });

		assert.strictEqual(updated, '<?xml version="1.0"?>\n<map version="1.0.1"><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/><node ID="b" TEXT="B"/><node ID="c" TEXT="C" /></node></map>');
	});

	test('appendMindmapChild expands a self-closing parent and keeps its attrs', () => {
		const xml = '<map><node ID="root" TEXT="Root" CREATED="1" /></map>';

		const updated = appendMindmapChild(xml, 'root', { newId: 'first', text: 'First &<>' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root" CREATED="1" ><node ID="first" TEXT="First &amp;&lt;&gt;" /></node></map>');
	});

	test('appendMindmapSibling inserts after the sibling element', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node><node ID="b" TEXT="B"/></node></map>';

		const updated = appendMindmapSibling(xml, 'a', { newId: 'a2', text: 'A2', position: 'right' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node><node ID="a2" TEXT="A2" POSITION="right" /><node ID="b" TEXT="B"/></node></map>');
	});

	test('appendMindmapSibling refuses to insert next to root', () => {
		const xml = '<map><node ID="root" TEXT="Root"/></map>';
		assert.strictEqual(appendMindmapSibling(xml, 'root', { newId: 'x', text: 'X' }), xml);
	});

	test('removeMindmapNode removes a subtree but keeps siblings and unknown children', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node><hook NAME="MapStyle"/><node ID="b" TEXT="B"/></node></map>';

		const updated = removeMindmapNode(xml, 'a');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><hook NAME="MapStyle"/><node ID="b" TEXT="B"/></node></map>');
	});

	test('removeMindmapNode refuses to delete the root', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/></node></map>';
		assert.strictEqual(removeMindmapNode(xml, 'root'), xml);
	});

	test('removeMindmapNode handles self-closing nodes', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/><node ID="b" TEXT="B"/></node></map>';

		const updated = removeMindmapNode(xml, 'a');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="b" TEXT="B"/></node></map>');
	});

	test('setMindmapNodeFolded inserts FOLDED="true" on an unfolded node', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node></node></map>';

		const updated = setMindmapNodeFolded(xml, 'a', true);

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" FOLDED="true"><node ID="a1" TEXT="A1"/></node></node></map>');
	});

	test('setMindmapNodeFolded inserts FOLDED on a self-closing node', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" /></node></map>';

		const updated = setMindmapNodeFolded(xml, 'a', true);

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" FOLDED="true" /></node></map>');
	});

	test('setMindmapNodeFolded removes FOLDED when unfolding', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" FOLDED="true"><node ID="a1" TEXT="A1"/></node></node></map>';

		const updated = setMindmapNodeFolded(xml, 'a', false);

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node></node></map>');
	});

	test('setMindmapNodeFolded is a no-op when state already matches', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/></node></map>';
		assert.strictEqual(setMindmapNodeFolded(xml, 'a', false), xml);
	});

	test('setMindmapNodeFolded preserves unknown attributes and unknown children', () => {
		const xml = '<map><node ID="root" TEXT="Root" CREATED="1"><node ID="a" TEXT="A" COLOR="#abc"><hook NAME="MapStyle"/><node ID="a1" TEXT="A1"/></node></node></map>';

		const updated = setMindmapNodeFolded(xml, 'a', true);

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root" CREATED="1"><node ID="a" TEXT="A" COLOR="#abc" FOLDED="true"><hook NAME="MapStyle"/><node ID="a1" TEXT="A1"/></node></node></map>');
	});

	test('addMindmapNodeIcon inserts <icon BUILTIN="..."/> after the open tag', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node></node></map>';

		const updated = addMindmapNodeIcon(xml, 'a', 'idea');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><icon BUILTIN="idea"/><node ID="a1" TEXT="A1"/></node></node></map>');
	});

	test('addMindmapNodeIcon expands self-closing nodes while keeping attrs', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" COLOR="#abc" /></node></map>';

		const updated = addMindmapNodeIcon(xml, 'a', 'flag');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" COLOR="#abc"><icon BUILTIN="flag"/></node></node></map>');
	});

	test('addMindmapNodeIcon is a no-op when the icon already exists on that node', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><icon BUILTIN="idea"/></node></node></map>';

		assert.strictEqual(addMindmapNodeIcon(xml, 'a', 'idea'), xml);
	});

	test('addMindmapNodeIcon does not confuse nested-node icons with the target node', () => {
		// Child `a1` already has `idea`, but the target is `a` — `a` should still receive its own icon.
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"><icon BUILTIN="idea"/></node></node></node></map>';

		const updated = addMindmapNodeIcon(xml, 'a', 'idea');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><icon BUILTIN="idea"/><node ID="a1" TEXT="A1"><icon BUILTIN="idea"/></node></node></node></map>');
	});

	test('removeMindmapNodeIcon removes one icon and keeps surrounding hook / nested nodes intact', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><icon BUILTIN="idea"/><hook NAME="MapStyle"/><node ID="a1" TEXT="A1"><icon BUILTIN="idea"/></node></node></node></map>';

		const updated = removeMindmapNodeIcon(xml, 'a', 'idea');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><hook NAME="MapStyle"/><node ID="a1" TEXT="A1"><icon BUILTIN="idea"/></node></node></node></map>');
	});

	test('removeMindmapNodeIcon is a no-op when the target icon is absent', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><icon BUILTIN="flag"/></node></node></map>';

		assert.strictEqual(removeMindmapNodeIcon(xml, 'a', 'idea'), xml);
	});

	test('setMindmapNodeColor inserts COLOR after the last attribute when missing', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/></node></map>';

		const updated = setMindmapNodeColor(xml, 'a', '#ff8800');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" COLOR="#ff8800"/></node></map>');
	});

	test('setMindmapNodeColor replaces COLOR value in place without touching other attrs', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" COLOR="#aaaaaa" BACKGROUND_COLOR="#ffffff"/></node></map>';

		const updated = setMindmapNodeColor(xml, 'a', '#112233');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" COLOR="#112233" BACKGROUND_COLOR="#ffffff"/></node></map>');
	});

	test('setMindmapNodeColor with null clears COLOR and its leading whitespace', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" COLOR="#aaaaaa" BACKGROUND_COLOR="#ffffff"/></node></map>';

		const updated = setMindmapNodeColor(xml, 'a', null);

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" BACKGROUND_COLOR="#ffffff"/></node></map>');
	});

	test('setMindmapNodeBackgroundColor is a no-op when clearing an absent attribute', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/></node></map>';

		assert.strictEqual(setMindmapNodeBackgroundColor(xml, 'a', null), xml);
	});

	test('setMindmapNodeFont inserts a new <font/> child after the open tag', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"/></node></node></map>';

		const updated = setMindmapNodeFont(xml, 'a', { size: 16, bold: true });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font SIZE="16" BOLD="true"/><node ID="a1" TEXT="A1"/></node></node></map>');
	});

	test('setMindmapNodeFont expands self-closing nodes when inserting <font/>', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" /></node></map>';

		const updated = setMindmapNodeFont(xml, 'a', { italic: true });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font ITALIC="true"/></node></node></map>');
	});

	test('setMindmapNodeFont merges patch with existing <font/> attributes', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font NAME="Arial" SIZE="12" BOLD="true"/></node></node></map>';

		const updated = setMindmapNodeFont(xml, 'a', { size: 18, italic: true });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font NAME="Arial" SIZE="18" BOLD="true" ITALIC="true"/></node></node></map>');
	});

	test('setMindmapNodeFont with bold:false clears BOLD but keeps other attrs', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font NAME="Arial" SIZE="12" BOLD="true" ITALIC="true"/></node></node></map>';

		const updated = setMindmapNodeFont(xml, 'a', { bold: false });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font NAME="Arial" SIZE="12" ITALIC="true"/></node></node></map>');
	});

	test('setMindmapNodeFont removes the whole <font/> tag when the patch empties it', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font BOLD="true"/></node></node></map>';

		const updated = setMindmapNodeFont(xml, 'a', { bold: false });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"></node></node></map>');
	});

	test('setMindmapNodeFont does not confuse nested-node <font/> with the target', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"><font SIZE="20"/></node></node></node></map>';

		const updated = setMindmapNodeFont(xml, 'a', { size: 14 });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font SIZE="14"/><node ID="a1" TEXT="A1"><font SIZE="20"/></node></node></node></map>');
	});

	test('parseMindmapXml exposes <font/> attributes on the parent node', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font NAME="Arial" SIZE="18" BOLD="true" ITALIC="true"/></node></node></map>';

		const doc = parseMindmapXml(xml);
		const a = doc.root?.children[0];

		assert.strictEqual(a?.font?.name, 'Arial');
		assert.strictEqual(a?.font?.size, 18);
		assert.strictEqual(a?.font?.bold, true);
		assert.strictEqual(a?.font?.italic, true);
	});

	test('setMindmapNodeEdge inserts a new <edge/> child after the open tag', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"></node></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { color: '#ff0000', width: 3, style: 'bezier' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#ff0000" WIDTH="3" STYLE="bezier"/></node></node></map>');
	});

	test('setMindmapNodeEdge expands self-closing nodes when inserting <edge/>', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A" /></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { color: '#00aa00' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#00aa00"/></node></node></map>');
	});

	test('setMindmapNodeEdge merges patch with existing <edge/> attributes', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#000000" WIDTH="2"/></node></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { style: 'sharp_linear' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#000000" WIDTH="2" STYLE="sharp_linear"/></node></node></map>');
	});

	test('setMindmapNodeEdge with color:null clears COLOR but keeps other attrs', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#ff0000" WIDTH="2" STYLE="bezier"/></node></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { color: null });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge WIDTH="2" STYLE="bezier"/></node></node></map>');
	});

	test('setMindmapNodeEdge removes the whole <edge/> tag when the patch empties it', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#ff0000"/></node></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { color: null });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"></node></node></map>');
	});

	test('setMindmapNodeEdge rejects style values outside the FreeMind whitelist', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"></node></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { style: 'wobbly' });

		assert.strictEqual(updated, xml);
	});

	test('setMindmapNodeEdge does not confuse nested-node <edge/> with the target', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><node ID="a1" TEXT="A1"><edge COLOR="#111111"/></node></node></node></map>';

		const updated = setMindmapNodeEdge(xml, 'a', { color: '#222222' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#222222"/><node ID="a1" TEXT="A1"><edge COLOR="#111111"/></node></node></node></map>');
	});

	test('parseMindmapXml exposes <edge/> attributes on the parent node', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><edge COLOR="#abcdef" WIDTH="thin" STYLE="bezier"/></node></node></map>';

		const doc = parseMindmapXml(xml);
		const a = doc.root?.children[0];

		assert.strictEqual(a?.edge?.color, '#abcdef');
		assert.strictEqual(a?.edge?.width, 'thin');
		assert.strictEqual(a?.edge?.style, 'bezier');
	});

	test('appendMindmapArrowlink inserts before the source </node> with default ENDARROW', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"></node><node ID="b" TEXT="B"></node></node></map>';

		const updated = appendMindmapArrowlink(xml, 'a', { newId: 'al-1', destination: 'b' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default"/></node><node ID="b" TEXT="B"></node></node></map>');
	});

	test('appendMindmapArrowlink expands self-closing source nodes', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"/><node ID="b" TEXT="B"/></node></map>';

		const updated = appendMindmapArrowlink(xml, 'a', { newId: 'al-1', destination: 'b', endArrow: 'Default', color: '#ff0000' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default" COLOR="#ff0000"/></node><node ID="b" TEXT="B"/></node></map>');
	});

	test('appendMindmapArrowlink leaves the source xml unchanged when the source node is missing', () => {
		const xml = '<map><node ID="root" TEXT="Root"></node></map>';

		const updated = appendMindmapArrowlink(xml, 'ghost', { newId: 'al-1', destination: 'root' });

		assert.strictEqual(updated, xml);
	});

	test('appendMindmapArrowlink puts the arrow after existing edge/font/nested children', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font BOLD="true"/><edge COLOR="#111111"/><node ID="a1" TEXT="A1"/></node><node ID="b" TEXT="B"/></node></map>';

		const updated = appendMindmapArrowlink(xml, 'a', { newId: 'al-1', destination: 'b' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><font BOLD="true"/><edge COLOR="#111111"/><node ID="a1" TEXT="A1"/><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default"/></node><node ID="b" TEXT="B"/></node></map>');
	});

	test('updateMindmapArrowlink rewrites the matching tag and preserves attribute order', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default" COLOR="#111111"/></node><node ID="b" TEXT="B"/></node></map>';

		const updated = updateMindmapArrowlink(xml, 'al-1', { color: '#22ff22', endArrow: null });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" COLOR="#22ff22"/></node><node ID="b" TEXT="B"/></node></map>');
	});

	test('updateMindmapArrowlink retargets the destination', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default"/></node><node ID="b" TEXT="B"/><node ID="c" TEXT="C"/></node></map>';

		const updated = updateMindmapArrowlink(xml, 'al-1', { destination: 'c' });

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="c" STARTARROW="None" ENDARROW="Default"/></node><node ID="b" TEXT="B"/><node ID="c" TEXT="C"/></node></map>');
	});

	test('updateMindmapArrowlink rejects arrow values outside the FreeMind whitelist', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default"/></node></node></map>';

		const updated = updateMindmapArrowlink(xml, 'al-1', { endArrow: 'Triangle' as any });

		assert.strictEqual(updated, xml);
	});

	test('removeMindmapArrowlink drops the matching tag and leaves siblings intact', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default"/><arrowlink ID="al-2" DESTINATION="c" STARTARROW="None" ENDARROW="Default"/></node></node></map>';

		const updated = removeMindmapArrowlink(xml, 'al-1');

		assert.strictEqual(updated, '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-2" DESTINATION="c" STARTARROW="None" ENDARROW="Default"/></node></node></map>');
	});

	test('removeMindmapArrowlink is a no-op when the arrowlink does not exist', () => {
		const xml = '<map><node ID="root" TEXT="Root"></node></map>';

		const updated = removeMindmapArrowlink(xml, 'al-ghost');

		assert.strictEqual(updated, xml);
	});

	test('parseMindmapXml exposes arrowlinks on the source node', () => {
		const xml = '<map><node ID="root" TEXT="Root"><node ID="a" TEXT="A"><arrowlink ID="al-1" DESTINATION="b" STARTARROW="None" ENDARROW="Default" COLOR="#abcdef"/><arrowlink ID="al-2" DESTINATION="c"/></node><node ID="b" TEXT="B"/><node ID="c" TEXT="C"/></node></map>';

		const doc = parseMindmapXml(xml);
		const a = doc.root?.children[0];

		assert.strictEqual(a?.arrowlinks.length, 2);
		assert.strictEqual(a?.arrowlinks[0].id, 'al-1');
		assert.strictEqual(a?.arrowlinks[0].destination, 'b');
		assert.strictEqual(a?.arrowlinks[0].startArrow, 'None');
		assert.strictEqual(a?.arrowlinks[0].endArrow, 'Default');
		assert.strictEqual(a?.arrowlinks[0].color, '#abcdef');
		assert.strictEqual(a?.arrowlinks[1].id, 'al-2');
		assert.strictEqual(a?.arrowlinks[1].destination, 'c');
		assert.strictEqual(a?.arrowlinks[1].startArrow, undefined);
		assert.strictEqual(a?.arrowlinks[1].endArrow, undefined);
	});
});
