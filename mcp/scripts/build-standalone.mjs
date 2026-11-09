import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(core, '..');
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [resolve(core, 'src/stdio.ts')],
  outfile: resolve(output, 'stdio.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['@resvg/resvg-js'],
  legalComments: 'linked',
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  plugins: [
    {
      name: 'standalone-catalog-location',
      setup(builder) {
        builder.onLoad({ filter: /[/\\]src[/\\]assets\.ts$/ }, () => ({
          contents: `import { fileURLToPath } from 'node:url';
          export function engineCatalogRoot() { return fileURLToPath(new URL('./catalog/', import.meta.url)); }`,
          loader: 'ts',
        }));
      },
    },
  ],
});
await cp(resolve(root, 'engine/catalog'), resolve(output, 'catalog'), { recursive: true });
// The bundled catalog graph reads services relative to its emitted module.
await cp(resolve(root, 'engine/catalog/services.json'), resolve(output, 'services.json'));
await cp(resolve(core, 'dist/fonts'), resolve(output, 'fonts'), { recursive: true });
