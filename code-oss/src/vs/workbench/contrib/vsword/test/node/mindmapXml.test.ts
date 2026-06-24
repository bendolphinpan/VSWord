/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { join, resolve } from '../../../../../base/common/path.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseMindmapXml, serializeMindmapXml, updateMindmapNodeText } from '../../common/mindmapXml.js';

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
});
