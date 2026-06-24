/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { join, resolve } from '../../../../../base/common/path.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { addMindmapNodeIcon, appendMindmapChild, appendMindmapSibling, parseMindmapXml, removeMindmapNode, removeMindmapNodeIcon, serializeMindmapXml, setMindmapNodeFolded, updateMindmapNodeText } from '../../common/mindmapXml.js';

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
});
