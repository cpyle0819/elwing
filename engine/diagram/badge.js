// Resource-card badge rules shared by the SVG and Excalidraw exports, layout and validation.
export const DEFAULT_BADGE_COLOR = '#1d8102';
export const DARK_BADGE_TEXT = '#16191f';
export const MAX_BADGE_LABEL = 12;
export const BADGE_HEIGHT = 18;
export const BADGE_PADDING = 8;
export const BADGE_FONT_SIZE = 10;
export const BADGE_LETTER_SPACING = 0.5;

// Returns '#rrggbb' for '#rgb' or '#rrggbb' input, otherwise null.
export function normalizeBadgeColor(value) {
  if (typeof value !== 'string') return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

const channel = (hex) => {
  const value = parseInt(hex, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (color) =>
  0.2126 * channel(color.slice(1, 3)) +
  0.7152 * channel(color.slice(3, 5)) +
  0.0722 * channel(color.slice(5, 7));
// White text unless its WCAG contrast ratio on the fill is below 4.5.
export const badgeTextColor = (color) =>
  1.05 / (luminance(color) + 0.05) < 4.5 ? DARK_BADGE_TEXT : '#ffffff';

// Conservative caps metrics: wide enough for Arial 10px bold in SVG and DejaVu Sans in PNG.
const characterWidth = (character) =>
  /[MW]/.test(character)
    ? 9.5
    : /[IJ1.,:;!' ]/.test(character)
      ? 3.5
      : /[A-Z0-9]/.test(character)
        ? 7.3
        : 6.5;
const labelWidth = (text) =>
  Array.from(text).reduce(
    (width, character) => width + characterWidth(character) + BADGE_LETTER_SPACING,
    0,
  );

// Pill geometry relative to the card origin, centred on the card's top-right corner point,
// or null when the node has no badge.
export function badgeLayout(node, cardWidth) {
  const label = node.badge?.label?.trim().toUpperCase();
  if (!label) return null;
  // A badge never takes more than half the card, so it stays clear of the icon area.
  const maxWidth = Math.floor(cardWidth / 2);
  let text = label;
  const fits = (value) => labelWidth(value) + BADGE_PADDING * 2 <= maxWidth;
  if (!fits(text)) {
    while (text.length > 1 && !fits(text + '…')) text = Array.from(text).slice(0, -1).join('');
    text += '…';
  }
  const width = Math.ceil(labelWidth(text) + BADGE_PADDING * 2);
  const color = normalizeBadgeColor(node.badge.color) ?? DEFAULT_BADGE_COLOR;
  return {
    label: text,
    fullLabel: label,
    color,
    textColor: badgeTextColor(color),
    x: cardWidth - width / 2,
    y: -BADGE_HEIGHT / 2,
    width,
    height: BADGE_HEIGHT,
  };
}

// Space a badged card needs to its right-hand neighbour: the overhang plus a small margin.
export const BADGE_MARGIN = 4;
export function badgeClearance(node, cardWidth) {
  const badge = badgeLayout(node, cardWidth);
  return badge ? badge.x + badge.width - cardWidth + BADGE_MARGIN : 0;
}

// Returns a user-facing error for an invalid badge, or null; normalises the colour in place.
export function badgeIssue(node) {
  if (node.badge === undefined) return null;
  if (node.service === 'group') return 'Badges are supported on resource cards only, not groups.';
  const { badge } = node;
  if (
    !badge ||
    typeof badge !== 'object' ||
    Array.isArray(badge) ||
    Object.keys(badge).some((key) => key !== 'label' && key !== 'color') ||
    typeof badge.label !== 'string'
  )
    return 'Invalid badge. Use { label, color? } with a label of 1–12 characters.';
  const length = Array.from(badge.label.trim()).length;
  if (length < 1 || length > MAX_BADGE_LABEL)
    return `Invalid badge label. Use 1–${MAX_BADGE_LABEL} characters.`;
  if (badge.color === undefined) return null;
  const color = normalizeBadgeColor(badge.color);
  if (!color) return 'Invalid badge color. Use a hex colour such as #1d8102 or #1d8.';
  badge.color = color;
  return null;
}
