import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const result = await build({
  entryPoints: ['server/index.mjs'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  legalComments: 'eof',
  write: false,
});
const bundle = result.outputFiles[0].contents;
await mkdir('dist', { recursive: true });
await writeFile('dist/server.cjs', bundle);
await writeFile('dist/server.sha256', createHash('sha256').update(bundle).digest('hex'));
console.log(`Bundled Markdown Table Tools server (${bundle.length} bytes).`);
