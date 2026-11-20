import { escapeMarkup } from './text.js';
import { normalizeBadgeColor } from './badge.js';

export const DEFAULT_EXPORT_BACKGROUND = 'transparent';
// Returns 'transparent' or '#rrggbb'; throws on anything else so callers reject bad input.
export function normalizeBackground(value = DEFAULT_EXPORT_BACKGROUND) {
  if (value === 'transparent') return value;
  const hex = normalizeBadgeColor(value);
  if (!hex) throw Error('Invalid background. Use "transparent" or a hex colour #RRGGBB or #RGB.');
  return hex;
}

// Frame the rendered diagram using exact connector bounds.
export function diagramSvg(graph, renderer, { background, ...options } = {}) {
  const fill = normalizeBackground(background);
  const copy = structuredClone(graph);
  const bounds = renderer.bounds(copy);
  const x = bounds.minX - 40,
    y = bounds.minY - 60;
  const width = bounds.maxX - x + 40,
    height = bounds.maxY - y + 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${fill === 'transparent' ? '' : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`}<title>${escapeMarkup(copy.title)}</title><text x="${x + 30}" y="${y + 30}" font-family="Arial" font-size="18" fill="#243744">${escapeMarkup(copy.title)}</text>${renderer.render(copy, { ...options, exporting: true, background: fill, frame: { x, y, width, height } })}</svg>`;
  return { svg, width, height };
}

export function boundedPngScale(width, height) {
  const requested = Math.min(
    2,
    8192 / width,
    8192 / height,
    Math.sqrt(16_000_000 / (width * height)),
  );
  const fits = (scale) =>
    Math.ceil(width * scale) <= 8192 &&
    Math.ceil(height * scale) <= 8192 &&
    Math.ceil(width * scale) * Math.ceil(height * scale) <= 16_000_000;
  if (fits(requested)) return requested;
  // Account for raster rounding when enforcing side and total-pixel limits.
  let low = 0,
    high = requested;
  for (let iteration = 0; iteration < 48; iteration++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}
