import { manualPoints } from './manual-routing.js';
import { connectorAttachments } from './diagram-presentation.js';
import { isFlowchart, clipToOutline, flowSides, flowEdgeText } from './flowchart.js';
import { isGroup, nodeWidth, nodeHeight, sharedGroupBounds, withinBounds } from './groups.js';
const GAP = 14,
  LINE_CLEARANCE = 6;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const interval = (a, b) => [Math.min(a, b), Math.max(a, b)];
function simplify(points) {
  const result = [];
  for (const p of points) {
    if (result.length && distance(result.at(-1), p) === 0) continue;
    while (result.length > 1) {
      const a = result.at(-2),
        b = result.at(-1);
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) result.pop();
      else break;
    }
    if (!result.length || distance(result.at(-1), p) !== 0) result.push(p);
  }
  return result;
}
export function segments(points) {
  return points.slice(1).map((b, i) => ({ a: points[i], b, h: points[i].y === b.y }));
}
export function segmentHitsCard(segment, node, padding = 0) {
  const { a, b, h } = segment,
    [lo, hi] = interval(h ? a.x : a.y, h ? b.x : b.y);
  return h
    ? a.y > node.y - padding &&
        a.y < node.y + nodeHeight(node) + padding &&
        hi > node.x - padding &&
        lo < node.x + nodeWidth(node) + padding
    : a.x > node.x - padding &&
        a.x < node.x + nodeWidth(node) + padding &&
        hi > node.y - padding &&
        lo < node.y + nodeHeight(node) + padding;
}
// Each card side has an independent center port; only shared sides need offset lanes.
function ports(node, side, used, degree) {
  const horizontal = side === 'left' || side === 'right',
    extent = horizontal ? 30 : 58;
  const spacing = Math.min(12, (2 * extent) / (degree + 1));
  const available = (offset) => !used.some((value) => Math.abs(value - offset) < spacing * 0.45);
  const offsets = [];
  if (available(0)) offsets.push(0);
  else
    for (const sign of [-1, 1])
      for (let lane = 1; lane <= degree; lane++) {
        const offset = sign * lane * spacing;
        if (Math.abs(offset) > extent + 1e-8) break;
        if (available(offset)) {
          offsets.push(offset);
          break;
        }
      }
  return offsets.map((offset) => {
    const x = node.x + nodeWidth(node) / 2 + (horizontal ? 0 : offset),
      y = node.y + nodeHeight(node) / 2 + (horizontal ? offset : 0);
    const anchor =
      side === 'right'
        ? { x: node.x + nodeWidth(node), y }
        : side === 'left'
          ? { x: node.x, y }
          : side === 'bottom'
            ? { x, y: node.y + nodeHeight(node) }
            : { x, y: node.y };
    const exit = {
      x: anchor.x + (side === 'right' ? 24 : side === 'left' ? -24 : 0),
      y: anchor.y + (side === 'bottom' ? 24 : side === 'top' ? -24 : 0),
    };
    return { anchor, exit, offset };
  });
}
function tracks(values, center, low, high, limit, local = []) {
  const unique = [...new Set(values.filter(Number.isFinite))].sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center),
  );
  return [...new Set([...local, ...unique.slice(0, limit), low, high])];
}
function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
function addSegments(index, list) {
  for (const segment of list) {
    const map = segment.h ? index.h : index.v,
      key = segment.h ? segment.a.y : segment.a.x;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(segment);
  }
}
function intersections(list, index, cache) {
  let overlap = 0,
    crossings = 0;
  for (const s of list) {
    const key = `${s.a.x},${s.a.y},${s.b.x},${s.b.y}`;
    const cached = cache.get(key);
    if (cached) {
      for (const amount of cached.overlaps) overlap += amount;
      crossings += cached.crossings;
      continue;
    }
    const overlaps = [];
    let segmentCrossings = 0;
    const [lo, hi] = interval(s.h ? s.a.x : s.a.y, s.h ? s.b.x : s.b.y),
      fixed = s.h ? s.a.y : s.a.x;
    // Nearby parallel strokes visually merge even when their coordinates are not identical.
    for (const [coordinate, oldSegments] of s.h ? index.h : index.v)
      if (Math.abs(coordinate - fixed) < LINE_CLEARANCE)
        for (const old of oldSegments) {
          const [a, b] = interval(s.h ? old.a.x : old.a.y, s.h ? old.b.x : old.b.y);
          const amount = Math.max(0, Math.min(hi, b) - Math.max(lo, a));
          if (amount) overlaps.push(amount);
          overlap += amount;
        }
    for (const [coordinate, oldSegments] of s.h ? index.v : index.h)
      if (coordinate > lo && coordinate < hi)
        for (const old of oldSegments) {
          const [a, b] = interval(s.h ? old.a.y : old.a.x, s.h ? old.b.y : old.b.x);
          if (fixed > a && fixed < b) segmentCrossings++;
        }
    crossings += segmentCrossings;
    cache.set(key, { overlaps, crossings: segmentCrossings });
  }
  return { overlap, crossings };
}
function boxOverlap(a, b) {
  return (
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  );
}
function labelSegmentIndex(routes) {
  const index = { h: [], v: [] };
  for (const [id, route] of routes)
    for (const line of route.segments) {
      const [low, high] = interval(line.h ? line.a.x : line.a.y, line.h ? line.b.x : line.b.y);
      index[line.h ? 'h' : 'v'].push({
        id,
        low,
        high,
        coordinate: line.h ? line.a.y : line.a.x,
      });
    }
  for (const lines of Object.values(index)) lines.sort((a, b) => a.coordinate - b.coordinate);
  return index;
}
function labelCrossings(box, edgeId, index) {
  let crossings = 0;
  for (const horizontal of [true, false]) {
    const lines = horizontal ? index.h : index.v,
      low = horizontal ? box.y : box.x,
      high = low + (horizontal ? box.h : box.w),
      start = horizontal ? box.x : box.y,
      end = start + (horizontal ? box.w : box.h);
    let left = 0,
      right = lines.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (lines[middle].coordinate <= low) left = middle + 1;
      else right = middle;
    }
    for (let i = left; i < lines.length && lines[i].coordinate < high; i++) {
      const line = lines[i];
      if (line.id !== edgeId && line.high > start && line.low < end) crossings++;
    }
  }
  return crossings;
}
const normals = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
const along = (a, b, side) => (b.x - a.x) * normals[side].x + (b.y - a.y) * normals[side].y;

// Shared coordinates let nearby or slightly offset cards connect directly, including separate reverse arrows.
function straightPaths(a, b, occupied) {
  const result = [];
  for (const horizontal of [true, false]) {
    const start = horizontal ? 'x' : 'y',
      cross = horizontal ? 'y' : 'x',
      size = horizontal ? nodeWidth(a) : nodeHeight(a),
      targetSize = horizontal ? nodeWidth(b) : nodeHeight(b),
      extent = horizontal ? nodeHeight(a) : nodeWidth(a),
      targetExtent = horizontal ? nodeHeight(b) : nodeWidth(b);
    const forward = b[start] >= a[start] + size,
      backward = a[start] >= b[start] + targetSize;
    if (!forward && !backward) continue;
    const sourceSide = horizontal ? (forward ? 'right' : 'left') : forward ? 'bottom' : 'top';
    const targetSide = horizontal ? (forward ? 'left' : 'right') : forward ? 'top' : 'bottom';
    const low = Math.max(a[cross], b[cross]) + 18,
      high = Math.min(a[cross] + extent, b[cross] + targetExtent) - 18;
    if (low > high) continue;
    const middle = (a[cross] + extent / 2 + b[cross] + targetExtent / 2) / 2;
    const coordinates = [
      middle,
      a[cross] + extent / 2,
      b[cross] + targetExtent / 2,
      ...[-24, 24, -12, 12, -30, 30, -48, 48].map((offset) => middle + offset),
    ];
    for (const coordinate of [
      ...new Set(coordinates.map((value) => Math.max(low, Math.min(high, value)))),
    ]) {
      const sourceOffset = coordinate - a[cross] - extent / 2,
        targetOffset = coordinate - b[cross] - targetExtent / 2;
      if (
        occupied.get(a.id)[sourceSide].some((offset) => Math.abs(offset - sourceOffset) < 6) ||
        occupied.get(b.id)[targetSide].some((offset) => Math.abs(offset - targetOffset) < 6)
      )
        continue;
      const source = { [start]: a[start] + (forward ? size : 0), [cross]: coordinate },
        target = { [start]: b[start] + (forward ? 0 : targetSize), [cross]: coordinate };
      if (distance(source, target) === 0) continue;
      result.push({ points: [source, target], sourceSide, targetSide, sourceOffset, targetOffset });
    }
  }
  return result;
}

// Card avoidance and separate lanes come first; crossings compete with bends and detour length.
// Unique ports and reserved channels separate fan-out, parallel, reverse, and cycle edges without requiring manual handles.
export function routeGraph(graph) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n])),
    result = new Map(),
    index = { h: new Map(), v: new Map() };
  if (!graph.edges.length) return result;
  const degree = new Map(
    graph.nodes.map((n) => [
      n.id,
      graph.edges.filter((e) => e.source === n.id || e.target === n.id).length,
    ]),
  );
  const occupied = new Map(
    graph.nodes.map((n) => [n.id, { left: [], right: [], top: [], bottom: [] }]),
  );
  const xs = graph.nodes.flatMap((n) => [n.x - GAP, n.x + nodeWidth(n) + GAP]),
    ys = graph.nodes.flatMap((n) => [n.y - GAP, n.y + nodeHeight(n) + GAP]);
  const bounds = {
    left: Math.min(...xs) - 40,
    right: Math.max(...xs) + 40,
    top: Math.min(...ys) - 40,
    bottom: Math.max(...ys) + 40,
  };
  const aligned = (edge) => {
    const a = nodes.get(edge.source),
      b = nodes.get(edge.target);
    return a.x === b.x || a.y === b.y;
  };
  const ordered = [...graph.edges].sort(
    (a, b) =>
      Number(Boolean(b.waypoints)) - Number(Boolean(a.waypoints)) ||
      Number(aligned(b)) - Number(aligned(a)) ||
      distance(nodes.get(a.source), nodes.get(a.target)) -
        distance(nodes.get(b.source), nodes.get(b.target)) ||
      a.id.localeCompare(b.id),
  );
  for (const [edgeIndex, edge] of ordered.entries()) {
    const a = nodes.get(edge.source),
      b = nodes.get(edge.target),
      { sourceSide: sourcePreferred, targetSide: targetPreferred } =
        edge.verb === 'flow'
          ? flowSides(edge, a, b, nodeWidth(a), nodeHeight(a), nodeWidth(b), nodeHeight(b))
          : connectorAttachments(edge);
    const lane = (edgeIndex % 7) * 12,
      limit = graph.edges.length > 150 ? 6 : 14;
    const enclosure = sharedGroupBounds(a, b, nodes);
    if (edge.waypoints) {
      const points = manualPoints(a, b, edge, enclosure);
      const lines = segments(points);
      occupied.get(a.id)[sourcePreferred].push(0);
      occupied.get(b.id)[targetPreferred].push(0);
      addSegments(index, lines);
      result.set(edge.id, {
        points,
        segments: lines,
        sourceSide: sourcePreferred,
        targetSide: targetPreferred,
        sourceOffset: 0,
        targetOffset: 0,
        d: points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
      });
      continue;
    }
    const routeBounds = enclosure || bounds;
    const columns = tracks(
      [
        ...xs,
        ...[...index.v.keys()].flatMap((x) => [x - 12, x + 12]),
        (a.x + nodeWidth(a) + b.x) / 2,
      ],
      (a.x + nodeWidth(a) + b.x) / 2,
      routeBounds.left - (enclosure ? 0 : lane),
      routeBounds.right + (enclosure ? 0 : lane),
      limit,
      [a.x - GAP, a.x + nodeWidth(a) + GAP, b.x - GAP, b.x + nodeWidth(b) + GAP],
    );
    const rows = tracks(
      [
        ...ys,
        ...[...index.h.keys()].flatMap((y) => [y - 12, y + 12]),
        (a.y + nodeHeight(a) / 2 + b.y + nodeHeight(b) / 2) / 2,
      ],
      (a.y + nodeHeight(a) / 2 + b.y + nodeHeight(b) / 2) / 2,
      routeBounds.top - (enclosure ? 0 : lane),
      routeBounds.bottom + (enclosure ? 0 : lane),
      limit,
      [a.y - GAP, a.y + nodeHeight(a) + GAP, b.y - GAP, b.y + nodeHeight(b) + GAP],
    );
    let best = null;
    // Candidate paths reuse segments. The obstacles stay fixed while this edge is scored.
    const hitCache = new Map();
    const intersectionCache = new Map();
    const requiredLabelSpan = flowEdgeText(edge).length * 6.3 + 22;
    function consider(points, sourceSide, targetSide, sourceOffset, targetOffset) {
      if (sourceSide !== sourcePreferred || targetSide !== targetPreferred) return;
      if (enclosure && points.some((point) => !withinBounds(point, enclosure))) return;
      // The path must leave the source outward and enter the target inward after removing retraced sections.
      if (
        points.length < 2 ||
        along(points[0], points[1], sourceSide) <= 0 ||
        along(points.at(-2), points.at(-1), targetSide) >= 0
      )
        return;
      const list = segments(points);
      let hits = 0,
        length = 0,
        longest = 0;
      for (const [i, segment] of list.entries()) {
        const span = distance(segment.a, segment.b);
        length += span;
        longest = Math.max(longest, span);
        const key = `${segment.a.x},${segment.a.y},${segment.b.x},${segment.b.y},${i === 0},${i === list.length - 1}`;
        let segmentHits = hitCache.get(key);
        if (segmentHits === undefined) {
          segmentHits = 0;
          for (const node of graph.nodes) {
            if (isGroup(node) && (a.groupId === node.id || b.groupId === node.id)) continue;
            if ((i === 0 && node.id === a.id) || (i === list.length - 1 && node.id === b.id))
              continue;
            if (segmentHitsCard(segment, node, 6)) segmentHits++;
          }
          hitCache.set(key, segmentHits);
        }
        hits += segmentHits;
        if (best && hits > best.score[0]) return;
      }
      if (best && hits > best.score[0]) return;
      const { overlap, crossings } = intersections(list, index, intersectionCache);
      const score = [
        hits,
        overlap,
        length +
          (list.length - 1) * 36 +
          crossings * 48 +
          Math.max(0, requiredLabelSpan - longest) * (list.length === 1 ? 0 : 8),
      ];
      if (!best || compare(score, best.score) < 0)
        best = {
          points,
          segments: list,
          sourceSide,
          targetSide,
          sourceOffset,
          targetOffset,
          score,
          length,
        };
    }
    for (const candidate of straightPaths(a, b, occupied))
      consider(
        candidate.points,
        candidate.sourceSide,
        candidate.targetSide,
        candidate.sourceOffset,
        candidate.targetOffset,
      );
    const sourceSide = sourcePreferred,
      targetSide = targetPreferred;
    for (const source of ports(a, sourceSide, occupied.get(a.id)[sourceSide], degree.get(a.id)))
      for (const target of ports(b, targetSide, occupied.get(b.id)[targetSide], degree.get(b.id))) {
        let s = source.exit,
          t = target.exit;
        const opposing =
          normals[sourceSide].x === -normals[targetSide].x &&
          normals[sourceSide].y === -normals[targetSide].y;
        const separation = along(source.anchor, target.anchor, sourceSide),
          centered = [];
        if (opposing && separation > 0) {
          const overlap = normals[sourceSide].x
            ? a.y < b.y + nodeHeight(b) && b.y < a.y + nodeHeight(a)
            : a.x < b.x + nodeWidth(b) && b.x < a.x + nodeWidth(a);
          const length = overlap ? Math.min(24, separation / 2) : 24;
          s = {
            x: source.anchor.x + normals[sourceSide].x * length,
            y: source.anchor.y + normals[sourceSide].y * length,
          };
          t = {
            x: target.anchor.x + normals[targetSide].x * length,
            y: target.anchor.y + normals[targetSide].y * length,
          };
          if (normals[sourceSide].x) {
            const x = (source.anchor.x + target.anchor.x) / 2;
            centered.push([s, { x, y: s.y }, { x, y: t.y }, t]);
          } else {
            const y = (source.anchor.y + target.anchor.y) / 2;
            centered.push([s, { x: s.x, y }, { x: t.x, y }, t]);
          }
        }
        if (enclosure) {
          for (const point of [s, t]) {
            point.x = Math.max(enclosure.left, Math.min(enclosure.right, point.x));
            point.y = Math.max(enclosure.top, Math.min(enclosure.bottom, point.y));
          }
        }
        const cores = [
          ...centered,
          [s, { x: t.x, y: s.y }, t],
          [s, { x: s.x, y: t.y }, t],
          ...columns.map((x) => [s, { x, y: s.y }, { x, y: t.y }, t]),
          ...rows.map((y) => [s, { x: s.x, y }, { x: t.x, y }, t]),
        ];
        for (const core of cores) {
          consider(
            simplify([source.anchor, ...core, target.anchor]),
            sourceSide,
            targetSide,
            source.offset,
            target.offset,
          );
        }
        // A clear perimeter route can still hide a much shorter path with one extra turn.
        const direct = distance(source.anchor, target.anchor);
        if (!best || best.score[0] > 0 || best.score[1] > 0 || best.length > direct * 1.5 + 96) {
          for (const x of columns)
            for (const y of rows)
              for (const core of [
                [s, { x, y: s.y }, { x, y }, { x: t.x, y }, t],
                [s, { x: s.x, y }, { x, y }, { x, y: t.y }, t],
              ]) {
                consider(
                  simplify([source.anchor, ...core, target.anchor]),
                  sourceSide,
                  targetSide,
                  source.offset,
                  target.offset,
                );
              }
        }
      }
    occupied.get(a.id)[best.sourceSide].push(best.sourceOffset);
    occupied.get(b.id)[best.targetSide].push(best.targetOffset);
    addSegments(index, best.segments);
    // Flowchart endpoints sit on the drawn outline, not the bounding box.
    if (isFlowchart(a) || isFlowchart(b)) {
      const points = [...best.points];
      if (isFlowchart(a))
        points[0] = clipToOutline(a, nodeWidth(a), nodeHeight(a), points[0], best.sourceSide);
      if (isFlowchart(b))
        points[points.length - 1] = clipToOutline(
          b,
          nodeWidth(b),
          nodeHeight(b),
          points.at(-1),
          best.targetSide,
        );
      best = { ...best, points, segments: segments(points) };
    }
    result.set(edge.id, {
      ...best,
      d: best.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '),
    });
  }
  const labels = [],
    labelLines = labelSegmentIndex(result),
    labelObstacles = graph.nodes.map((node) => {
      const n = isGroup(node) ? { ...node, height: 40 } : node;
      return { x: n.x - 4, y: n.y - 4, w: nodeWidth(n) + 8, h: nodeHeight(n) + 8 };
    });
  for (const edge of ordered) {
    const label = flowEdgeText(edge);
    const flow = edge.verb === 'flow';
    const route = result.get(edge.id),
      fullWidth = label.length * 6.3 + 6,
      candidates = [];
    const pair = ordered.filter(
      (other) =>
        (other.source === edge.source && other.target === edge.target) ||
        (other.source === edge.target && other.target === edge.source),
    );
    const position = (pair.findIndex((other) => other.id === edge.id) + 0.5) / pair.length;
    for (const segment of route.segments) {
      const length = distance(segment.a, segment.b),
        width = Math.max(0, Math.min(fullWidth, length - 10));
      const characters = Math.max(0, Math.floor((width - 6) / 6.3));
      const text =
        width >= fullWidth
          ? label
          : characters >= 2
            ? label.slice(0, characters - 1) + '…'
            : width >= 7
              ? '…'
              : '';
      const preferredRatio = (segment.h ? segment.b.x < segment.a.x : segment.b.y < segment.a.y)
        ? 1 - position
        : position;
      for (const ratio of [...new Set([preferredRatio, 0.5, 0.3, 0.7, 0.1, 0.9])]) {
        const fraction = Math.max(
          (width / 2 + 5) / length,
          Math.min(1 - (width / 2 + 5) / length, ratio),
        );
        const mid = {
          x: segment.a.x + (segment.b.x - segment.a.x) * fraction,
          y: segment.a.y + (segment.b.y - segment.a.y) * fraction,
        };
        // Flow labels stay horizontal, beside vertical segments.
        if (flow && !segment.h && text) mid.x += width / 2 + 6;
        const box = text
          ? segment.h || flow
            ? { x: mid.x - width / 2, y: mid.y - 7, w: width, h: 14 }
            : { x: mid.x - 7, y: mid.y - width / 2, w: 14, h: width }
          : { x: mid.x, y: mid.y, w: 0, h: 0 };
        let score =
          labelObstacles.reduce((sum, obstacle) => sum + boxOverlap(box, obstacle) * 100, 0) +
          labels.reduce((sum, b) => sum + boxOverlap(box, b) * 20, 0);
        // Keep the original addition sequence while querying only nearby line coordinates.
        for (let count = labelCrossings(box, edge.id, labelLines); count > 0; count--) score += 100;
        score +=
          (fullWidth - width) * 10 + Math.abs(ratio - preferredRatio) * 40 + (segment.h ? 0 : 2);
        candidates.push({
          box,
          score,
          x: mid.x,
          y: mid.y,
          labelWidth: width,
          labelAngle: segment.h || flow ? 0 : -90,
          labelText: text,
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const chosen = candidates[0];
    labels.push(chosen.box);
    Object.assign(route, {
      x: chosen.x,
      y: chosen.y,
      label: chosen.box,
      labelWidth: chosen.labelWidth,
      labelAngle: chosen.labelAngle,
      labelText: chosen.labelText,
    });
  }
  return result;
}
export function routingBounds(graph, routes = routeGraph(graph)) {
  const boxes = [
    ...graph.nodes.map((n) => ({ x: n.x, y: n.y, w: nodeWidth(n), h: nodeHeight(n) })),
    ...[...routes.values()].flatMap((route) => [
      route.label,
      ...route.points.map((p) => ({ ...p, w: 0, h: 0 })),
    ]),
  ];
  if (!boxes.length) return { minX: 0, minY: 0, maxX: 500, maxY: 350 };
  return {
    minX: Math.min(...boxes.map((b) => b.x)),
    minY: Math.min(...boxes.map((b) => b.y)),
    maxX: Math.max(...boxes.map((b) => b.x + b.w)),
    maxY: Math.max(...boxes.map((b) => b.y + b.h)),
  };
}
