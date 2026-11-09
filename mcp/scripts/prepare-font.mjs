import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import converter from 'woff2sfnt-sfnt2woff';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('@fontsource/dejavu-sans/package.json'));
const output = fileURLToPath(new URL('../dist/fonts/', import.meta.url));
await mkdir(output, { recursive: true });
// resvg reads TrueType, not WOFF. Expand the packaged font during the build.
await writeFile(
  join(output, 'DejaVuSans.ttf'),
  converter.toSfnt(await readFile(join(source, 'files/dejavu-sans-latin-400-normal.woff'))),
);
await copyFile(join(source, 'LICENSE'), join(output, 'LICENSE'));
