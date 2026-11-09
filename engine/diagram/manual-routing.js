import { connectorAttachments } from './diagram-presentation.js';
import { nodeWidth, nodeHeight } from './groups.js';

export const MAX_WAYPOINTS = 100;
const normals = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const horizontal = (side) => side === 'left' || side === 'right';
const equal = (a, b) => a.x === b.x && a.y === b.y;

export function clampWaypoint(point, bounds) {
  return {
    x: Math.max(
      Math.max(-100000, bounds?.left ?? -100000),
      Math.min(Math.min(100000, bounds?.right ?? 100000), point.x),
    ),
    y: Math.max(
      Math.max(-100000, bounds?.top ?? -100000),
      Math.min(Math.min(100000, bounds?.bottom ?? 100000), point.y),
    ),
  };
}

function anchor(node, side) {
  return {
    x: node.x + (side === 'left' ? 0 : side === 'right' ? nodeWidth(node) : nodeWidth(node) / 2),
    y: node.y + (side === 'top' ? 0 : side === 'bottom' ? nodeHeight(node) : nodeHeight(node) / 2),
  };
}

// Fixed endpoints follow their cards; user bends remain in canvas coordinates.
export function manualPoints(a, b, edge, bounds) {
  const { sourceSide, targetSide } = connectorAttachments(edge);
  const start = anchor(a, sourceSide),
    end = anchor(b, targetSide);
  const stub = (point, side) =>
    clampWaypoint(
      {
        x: point.x + normals[side][0] * 14,
        y: point.y + normals[side][1] * 14,
      },
      bounds,
    );
  const points = [start];
  const append = (point, across) => {
    const last = points.at(-1);
    if (last.x !== point.x && last.y !== point.y)
      points.push(across ? { x: point.x, y: last.y } : { x: last.x, y: point.y });
    if (!equal(points.at(-1), point)) points.push(point);
  };
  append(stub(start, sourceSide), horizontal(sourceSide));
  for (const point of edge.waypoints) {
    const previous = points.at(-2),
      last = points.at(-1);
    append(clampWaypoint(point, bounds), previous ? previous.y === last.y : horizontal(sourceSide));
  }
  append(stub(end, targetSide), !horizontal(targetSide));
  append(end, horizontal(targetSide));
  // Collapse redundant tracks, including reversals left by deleting a bend.
  const simplified = [];
  for (const point of points) {
    if (simplified.length && equal(simplified.at(-1), point)) continue;
    while (simplified.length > 1) {
      const before = simplified.at(-2),
        last = simplified.at(-1);
      if (
        (before.x === last.x && last.x === point.x) ||
        (before.y === last.y && last.y === point.y)
      )
        simplified.pop();
      else break;
    }
    if (!simplified.length || !equal(simplified.at(-1), point)) simplified.push(point);
  }
  // Coincident ports still need a nonzero route for arrow and label placement.
  return simplified.length > 1 ? simplified : points;
}

// Moving a corner also moves the adjoining tracks; card anchors are never moved.
export function moveBend(points, index, point) {
  const next = structuredClone(points);
  const original = points[index];
  next[index] = point;
  if (index > 1) {
    if (points[index - 1].x === original.x) next[index - 1].x = point.x;
    else next[index - 1].y = point.y;
  }
  if (index < points.length - 2) {
    if (points[index + 1].x === original.x) next[index + 1].x = point.x;
    else next[index + 1].y = point.y;
  }
  return next.slice(1, -1);
}

// Dragging a segment inserts a parallel track joined by two perpendicular legs.
export function bendSegment(points, index, point) {
  const a = points[index],
    b = points[index + 1],
    across = a.y === b.y;
  const first = { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  const last = { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 };
  const offsetFirst = across ? { x: first.x, y: point.y } : { x: point.x, y: first.y };
  const offsetLast = across ? { x: last.x, y: point.y } : { x: point.x, y: last.y };
  return [
    ...points.slice(0, index + 1),
    first,
    offsetFirst,
    offsetLast,
    last,
    ...points.slice(index + 1),
  ].slice(1, -1);
}

export function translateManualRoutes(graph, baseline) {
  const oldNodes = new Map(baseline.nodes.map((node) => [node.id, node]));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (!edge.waypoints) continue;
    const a = nodes.get(edge.source),
      b = nodes.get(edge.target);
    const oldA = oldNodes.get(edge.source),
      oldB = oldNodes.get(edge.target);
    if (!oldA || !oldB) continue;
    const dx = a.x - oldA.x,
      dy = a.y - oldA.y;
    if (dx === b.x - oldB.x && dy === b.y - oldB.y)
      edge.waypoints = edge.waypoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  }
}
