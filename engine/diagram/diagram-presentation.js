// Matching reads and writes share a visible connector; saved edges and their IDs remain independent.
export function connectorEdges(edges) {
  const pairs = new Map();
  for (const edge of edges) {
    if (
      edge.preview ||
      edge.label !== undefined ||
      !['reads from', 'writes to'].includes(edge.verb)
    )
      continue;
    const key = JSON.stringify([edge.source, edge.target]);
    if (!pairs.has(key)) pairs.set(key, {});
    pairs.get(key)[edge.verb] = edge;
  }
  return edges.flatMap((edge) => {
    const pair = pairs.get(JSON.stringify([edge.source, edge.target]));
    if (
      pair?.['reads from'] &&
      pair['reads from'].color === pair['writes to']?.color &&
      pair?.['writes to'] &&
      JSON.stringify(pair['reads from'].waypoints) === JSON.stringify(pair['writes to'].waypoints)
    ) {
      if (edge === pair['writes to']) return [];
      if (edge === pair['reads from'])
        return [
          {
            ...edge,
            label: 'reads / writes',
            edgeIds: [edge.id, pair['writes to'].id],
            combined: true,
          },
        ];
    }
    return [{ ...edge, edgeIds: [edge.id] }];
  });
}

// Resource focus traces every upstream path to its roots and retains immediate outgoing connections.
export function connectionContext(graph, nodeIds = [], edgeIds = []) {
  const nodes = new Set(nodeIds),
    edges = new Set(edgeIds);
  for (const node of graph.nodes) if (nodes.has(node.groupId)) nodes.add(node.id);
  if (!edgeIds.length) {
    const queue = [...nodes],
      visited = new Set(),
      byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const incoming = new Map();
    for (const edge of graph.edges) {
      if (nodes.has(edge.source)) edges.add(edge.id);
      if (!incoming.has(edge.target)) incoming.set(edge.target, []);
      incoming.get(edge.target).push(edge);
    }
    while (queue.length) {
      const id = queue.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      nodes.add(id);
      const parent = byId.get(id)?.groupId;
      if (parent) queue.push(parent);
      for (const edge of incoming.get(id) || []) {
        edges.add(edge.id);
        queue.push(edge.source);
      }
    }
  }
  for (const edge of graph.edges)
    if (edges.has(edge.id)) {
      nodes.add(edge.source);
      nodes.add(edge.target);
    }
  for (const node of graph.nodes) if (nodes.has(node.id) && node.groupId) nodes.add(node.groupId);
  return { nodes, edges };
}

// A crossing gap distinguishes unrelated paths without changing their geometry or hit targets.
export function connectorCrossings(routes, highlighted = new Set()) {
  const events = [],
    gaps = new Map();
  for (const [id, route] of routes) {
    for (const segment of route.segments) {
      const { a, b, h } = segment;
      if (h) {
        const left = Math.min(a.x, b.x) + 8,
          right = Math.max(a.x, b.x) - 8;
        if (left >= right) continue;
        const line = { id, y: a.y };
        events.push({ x: left, kind: 0, line }, { x: right, kind: 2, line });
      } else
        events.push({
          x: a.x,
          kind: 1,
          id,
          top: Math.min(a.y, b.y) + 8,
          bottom: Math.max(a.y, b.y) - 8,
        });
    }
  }
  events.sort((a, b) => a.x - b.x || a.kind - b.kind);
  const active = new Set();
  for (const event of events) {
    if (event.kind === 0) active.add(event.line);
    else if (event.kind === 2) active.delete(event.line);
    else {
      for (const line of active) {
        if (line.id === event.id || line.y <= event.top || line.y >= event.bottom) continue;
        if (highlighted.has(event.id) && !highlighted.has(line.id)) continue;
        if (!gaps.has(event.id)) gaps.set(event.id, new Map());
        gaps.get(event.id).set(`${event.x},${line.y}`, { x: event.x, y: line.y });
      }
    }
  }
  return new Map([...gaps].map(([id, points]) => [id, [...points.values()]]));
}

// Dash intervals open small gaps at crossings while preserving the original path and arrowhead.
export function crossingDashes(route, crossings = []) {
  if (!crossings.length) return '';
  const intervals = [];
  let length = 0;
  for (const segment of route.segments) {
    if (!segment.h)
      for (const point of crossings)
        if (
          point.x === segment.a.x &&
          point.y > Math.min(segment.a.y, segment.b.y) &&
          point.y < Math.max(segment.a.y, segment.b.y)
        ) {
          const offset = length + Math.abs(point.y - segment.a.y);
          intervals.push([offset - 4, offset + 4]);
        }
    length += Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y);
  }
  if (!intervals.length) return '';
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && previous[1] >= interval[0]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  const dashes = [];
  let end = 0;
  for (const [start, stop] of merged) {
    dashes.push(start - end, stop - start);
    end = stop;
  }
  dashes.push(length - end, length + 1);
  return dashes.join(' ');
}

// References point to a dependency; operation arrows otherwise enter the target as input.
const references = new Set([
  'reads from',
  'authorizes with',
  'authenticates with',
  'subscribes to',
  'mounts',
  'runs on',
  'runs in',
  'deploys with',
  'scales with',
  'trains with',
]);

export const attachmentSides = ['auto', 'top', 'bottom', 'left', 'right'];

export function connectorAttachments(edge) {
  const custom = edge.verb === 'custom';
  // Saved custom types retain their appearance when either side is Auto.
  const reference = custom
    ? ['read', 'reference'].includes(edge.connectionType)
    : references.has(edge.verb);
  return {
    sourceSide: custom && edge.sourceSide && edge.sourceSide !== 'auto' ? edge.sourceSide : 'right',
    targetSide:
      custom && edge.targetSide && edge.targetSide !== 'auto'
        ? edge.targetSide
        : !edge.combined && reference
          ? 'top'
          : 'left',
  };
}
