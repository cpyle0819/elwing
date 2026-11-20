import { isFlowchart, flowWidth, flowHeight, flowTextWidth, flowMaxLines } from './flowchart.js';
export const MIN_CARD_WIDTH = 164;
export const MIN_CARD_HEIGHT = 96;
export const MAX_CARD_WIDTH = 640;
export const MAX_CARD_HEIGHT = 800;
export const MAX_AUTO_HEIGHT = 256;
export const MAX_RESOURCE_TEXT = 1000;
export const resourceTextTop = (node) => (node.service === 'custom' ? 49 : 64);

// Conservative Arial metrics keep wrapping identical in the canvas, router, and image exports.
const characterWidth = (character) =>
  /[MWmw@#%]/.test(character)
    ? 11
    : /[ilI.,'!:;| ]/.test(character)
      ? 4
      : /[A-Z]/.test(character)
        ? 9
        : character.codePointAt(0) > 255
          ? 12
          : 7;
const textWidth = (text) =>
  Array.from(text).reduce((width, character) => width + characterWidth(character), 0);

export function wrapResourceText(text = '', width = MIN_CARD_WIDTH) {
  const available = width - 28;
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (line && textWidth(`${line} ${word}`) > available) {
        lines.push(line);
        line = '';
      }
      if (line) line += ' ';
      for (const character of word) {
        if (line && textWidth(line + character) > available) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const resourceWidth = (node) =>
  isFlowchart(node) ? flowWidth(node) : (node.width ?? MIN_CARD_WIDTH);
const wrapFlowText = (node, width, height) =>
  wrapResourceText(node.name, flowTextWidth(node, width, height) + 28);
// Flowchart text wraps to the usable width inside its outline; given a height, lines that
// would spill past the outline are dropped and the last kept line ends with an ellipsis.
export function flowTextLines(node, width = resourceWidth(node), height) {
  const lines = wrapFlowText(node, width, height);
  if (height === undefined) return lines;
  const max = flowMaxLines(node, height);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = kept[max - 1].slice(0, -1) + '…';
  return kept;
}
export function resourceHeight(node) {
  if (isFlowchart(node))
    return flowHeight(node, wrapFlowText(node, resourceWidth(node), 96).length);
  if (node.height !== undefined) return node.height;
  const lines = wrapResourceText(node.name, resourceWidth(node)).length;
  return Math.max(
    MIN_CARD_HEIGHT,
    Math.min(MAX_AUTO_HEIGHT, Math.ceil((resourceTextTop(node) + (lines - 1) * 16 + 15) / 8) * 8),
  );
}

export function resourceSize(width, height) {
  return {
    width: Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, Math.round(width))),
    height: Math.max(MIN_CARD_HEIGHT, Math.min(MAX_CARD_HEIGHT, Math.round(height))),
  };
}
