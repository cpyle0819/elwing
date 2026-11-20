// Flow chart shapes (service "flowchart"). One outline definition shared by sizing, routing and exports.
export const FLOWCHART_SHAPES = [
  'start-end',
  'process',
  'decision',
  'input-output',
  'document',
  'subprocess',
];
export const isFlowchart = (node) => node?.service === 'flowchart';
export const FLOW_STROKE = '#232f3e';
export const FLOW_TEXT = '#16191f';
const TINTS = { 'start-end': '#e9f5e6', decision: '#fff4e0' };
export const flowFill = (shape) => TINTS[shape] ?? '#ffffff';

// Parallelogram skew and document wave amplitude.
export const SKEW = 20;
export const WAVE = 8;
const DEFAULT_WIDTH = { decision: 180, 'input-output': 196 };
const MIN_HEIGHT = { decision: 120 };
// Shapes share the card size limits (164–640 × 96–800).
const MAX_HEIGHT = 800;

export const flowWidth = (node) => node.width ?? DEFAULT_WIDTH[node.shape] ?? 180;

// Usable text width inside the outline, for the shared wrapResourceText (which subtracts 28).
export function flowTextWidth(node, width = flowWidth(node), height = 96) {
  switch (node.shape) {
    case 'decision':
      return width * 0.55;
    case 'start-end':
      return Math.max(24, width - height * 0.5);
    case 'input-output':
      return width - SKEW * 2 - 8;
    case 'subprocess':
      return width - 24;
    default:
      return width - 8;
  }
}

// Text lines that fit inside a shape of height h (inverse of flowHeight's padding).
export function flowMaxLines(node, h) {
  const room =
    node.shape === 'decision'
      ? (h - 56) / 32
      : node.shape === 'document'
        ? (h - 48) / 16
        : (h - 40) / 16;
  return Math.max(1, Math.floor(room));
}

export function flowHeight(node, lineCount) {
  if (node.height !== undefined) return node.height;
  const text = lineCount * 16;
  const min = MIN_HEIGHT[node.shape] ?? 96;
  // A diamond only holds half its height at full text width, so it grows twice as fast.
  const needed =
    node.shape === 'decision' ? text * 2 + 56 : node.shape === 'document' ? text + 48 : text + 40;
  return Math.max(min, Math.min(MAX_HEIGHT, Math.ceil(needed / 8) * 8));
}

const sinePoints = (w, h) =>
  Array.from({ length: 25 }, (_, i) => {
    const x = (w * i) / 24;
    return [x, h - WAVE + WAVE * Math.sin((2 * Math.PI * i) / 24)];
  });

// Outline as points relative to the node origin (closed polygon), or null for curved shapes.
export function flowPolygon(shape, w, h) {
  switch (shape) {
    case 'decision':
      return [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
    case 'input-output':
      return [
        [SKEW, 0],
        [w, 0],
        [w - SKEW, h],
        [0, h],
      ];
    case 'document':
      return [[0, 0], [w, 0], ...sinePoints(w, h).reverse()];
    case 'process':
    case 'subprocess':
      return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
    default:
      return null;
  }
}

export function flowPath(shape, w, h) {
  if (shape === 'start-end') {
    const r = Math.min(h / 2, w / 2);
    return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  }
  const points = flowPolygon(shape, w, h);
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

// Move a route endpoint that sits on the bounding box inward to the drawn outline.
export function clipToOutline(node, w, h, point, side) {
  const lx = point.x - node.x,
    ly = point.y - node.y;
  const vertical = side === 'top' || side === 'bottom';
  const s = node.shape;
  let inset = 0;
  if (s === 'decision') {
    inset = vertical
      ? (h / 2) * Math.min(1, Math.abs(lx - w / 2) / (w / 2))
      : (w / 2) * Math.min(1, Math.abs(ly - h / 2) / (h / 2));
  } else if (s === 'input-output' && !vertical) {
    inset = side === 'left' ? SKEW * ((h - ly) / h) : SKEW * (ly / h);
  } else if (s === 'start-end') {
    const r = Math.min(h / 2, w / 2);
    if (!vertical) inset = r - Math.sqrt(Math.max(0, r * r - (ly - h / 2) ** 2));
    else {
      const dx = Math.max(0, r - lx, lx - (w - r));
      inset = r - Math.sqrt(Math.max(0, r * r - dx * dx));
    }
  } else if (s === 'document' && side === 'bottom') {
    inset = WAVE - WAVE * Math.sin((2 * Math.PI * lx) / w);
  }
  if (!inset) return point;
  const n = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[side];
  return { x: point.x + n[0] * inset, y: point.y + n[1] * inset };
}

// Side choice for flow edges: each manually chosen side wins; Auto sides use geometry,
// down the page with branches out to the right.
export function flowSides(edge, a, b, aw, ah, bw, bh) {
  const geometric = autoFlowSides(a, b, aw, ah, bw, bh);
  const manual = (side) => side && side !== 'auto';
  return {
    sourceSide: manual(edge.sourceSide) ? edge.sourceSide : geometric.sourceSide,
    targetSide: manual(edge.targetSide) ? edge.targetSide : geometric.targetSide,
  };
}
function autoFlowSides(a, b, aw, ah, bw, bh) {
  const acx = a.x + aw / 2,
    bcx = b.x + bw / 2;
  const below = b.y >= a.y + ah - 1,
    above = b.y + bh <= a.y + 1;
  const overlapX = Math.abs(acx - bcx) < Math.min(aw, bw) / 2;
  if (below && overlapX) return { sourceSide: 'bottom', targetSide: 'top' };
  if (below)
    return bcx > acx
      ? { sourceSide: 'right', targetSide: 'top' }
      : { sourceSide: 'bottom', targetSide: 'right' };
  // Loop-back to an earlier step: leave the side and re-enter the target from the left.
  if (above && overlapX) return { sourceSide: 'left', targetSide: 'left' };
  // Return to an earlier column: run back underneath and enter from below.
  return bcx >= acx
    ? { sourceSide: 'right', targetSide: 'left' }
    : { sourceSide: 'bottom', targetSide: 'bottom' };
}

export const flowEdgeText = (edge) =>
  edge.verb === 'flow' ? (edge.label ?? '') : (edge.label ?? edge.verb);
