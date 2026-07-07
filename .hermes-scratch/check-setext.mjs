import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(HERE, '..', 'code-oss', 'src', 'vs', 'workbench', 'contrib', 'vsword', 'test', 'fixtures', 'roundtrip');

const fixture = readFileSync(join(FIXTURE_ROOT, 'pandoc', 'heading-setext.md'), 'utf8');
console.log('Source bytes:');
console.log(JSON.stringify(fixture));
console.log('Length:', fixture.length);
console.log('Has BOM:', fixture.charCodeAt(0) === 0xFEFF);
console.log('Ends with \n:', fixture.endsWith('\n'));

const lines = fixture.split(/\r?\n/);
console.log('Lines:');
lines.forEach((l, i) => console.log(`  ${i}: ${JSON.stringify(l)} (len=${l.length})`));
