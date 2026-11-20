import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAsync } from '@resvg/resvg-js';
import { createDiagramRenderer } from 'elwing-diagram-engine/renderer';
import { createServiceCatalog, serviceLabel } from 'elwing-diagram-engine/catalog/services';
import { diagramSvg, boundedPngScale } from 'elwing-diagram-engine/image-export';
import { diagramExcalidraw } from 'elwing-diagram-engine/excalidraw-export';
import type { Diagram } from './store-rules.js';
import { engineCatalogRoot } from './assets.js';
export function createExporter(
  assetRoot = engineCatalogRoot(),
  fontPath = fileURLToPath(new URL('./fonts/DejaVuSans.ttf', import.meta.url)),
) {
  const services = JSON.parse(readFileSync(join(assetRoot, 'services.json'), 'utf8'));
  const catalog = createServiceCatalog(services),
    iconData: Record<string, string> = {};
  // Icon filenames come from the trusted package catalog; no user paths or network retrieval.
  for (const id of Object.keys(catalog)) {
    if (id === 'custom' || id === 'group') continue;
    iconData[id] =
      `data:image/svg+xml;base64,${readFileSync(join(assetRoot, 'icons', `${id}.svg`)).toString('base64')}`;
  }
  const renderer = createDiagramRenderer({
    serviceLabel: (node: any) => serviceLabel(node, catalog),
  });
  const rasterIcons = new Map<string, string>();
  readFileSync(fontPath); // Fail at setup if the bundled font is missing.
  return async (
    document: Diagram,
    format: 'svg' | 'png' | 'excalidraw',
    updatedAt?: string,
    { background }: { background?: string } = {},
  ) => {
    if (format === 'excalidraw') {
      const output = diagramExcalidraw(document, renderer, {
        iconData,
        serviceLabel: (node: any) => serviceLabel(node, catalog),
        updatedAt,
        background,
      });
      return {
        data: Buffer.from(output.text).toString('base64'),
        width: output.width,
        height: output.height,
        mimeType: 'application/vnd.excalidraw+json',
        filename: (document.title.replace(/[^a-z0-9_-]/gi, '-') || 'architecture') + '.excalidraw',
      };
    }
    const output = diagramSvg(document, renderer, {
      iconData,
      colorConnectors: false,
      background,
    });
    let { width, height } = output,
      bytes = Buffer.from(output.svg);
    if (format === 'png') {
      // Nested SVG images dominate large diagram raster time in resvg. Rasterize each
      // trusted icon once at twice its displayed size (the maximum PNG scale).
      let svg = output.svg;
      for (const source of Object.values(iconData)) {
        if (!svg.includes(source)) continue;
        let raster = rasterIcons.get(source);
        if (!raster) {
          const icon = await renderAsync(Buffer.from(source.split(',')[1], 'base64'), {
            fitTo: { mode: 'width', value: 66 },
            font: { loadSystemFonts: false },
          });
          raster = `data:image/png;base64,${icon.asPng().toString('base64')}`;
          rasterIcons.set(source, raster);
        }
        svg = svg.replaceAll(source, raster);
      }
      const image = await renderAsync(svg, {
        fitTo: { mode: 'zoom', value: boundedPngScale(width, height) },
        font: {
          fontFiles: [fontPath],
          loadSystemFonts: false,
          defaultFontFamily: 'DejaVu Sans',
          sansSerifFamily: 'DejaVu Sans',
        },
      });
      bytes = image.asPng();
      width = image.width;
      height = image.height;
    }
    return {
      data: bytes.toString('base64'),
      width,
      height,
      mimeType: format === 'png' ? 'image/png' : 'image/svg+xml',
      filename: (document.title.replace(/[^a-z0-9_-]/gi, '-') || 'architecture') + `.${format}`,
    };
  };
}
