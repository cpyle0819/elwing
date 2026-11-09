import { nodeWidth, nodeHeight } from './groups.js';
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

// Keep the chosen row order while placing each card as close as possible to its neighbors.
function compactRows(layer, desired, positions, heights, gap) {
  const offsets = [0];
  for (let i = 1; i < layer.length; i++)
    offsets[i] = offsets[i - 1] + (heights.get(layer[i - 1]) + heights.get(layer[i])) / 2 + gap;
  const blocks = [];
  for (let i = 0; i < layer.length; i++) {
    blocks.push({ start: i, end: i, sum: desired[i] - offsets[i], count: 1 });
    while (blocks.length > 1) {
      const right = blocks.at(-1),
        left = blocks.at(-2);
      if (left.sum / left.count <= right.sum / right.count) break;
      blocks.splice(-2, 2, {
        start: left.start,
        end: right.end,
        sum: left.sum + right.sum,
        count: left.count + right.count,
      });
    }
  }
  for (const block of blocks)
    for (let i = block.start; i <= block.end; i++)
      positions.set(layer[i], block.sum / block.count + offsets[i]);
}

// Dependency columns, neighbor ordering, and vertical compaction keep related cards together.
export function arrangeLayered(
  doc,
  { columnGap = 136, rowGap = 84, edgeOffsets = new Map() } = {},
) {
  if (!doc.nodes.length) return;
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const heights = new Map(doc.nodes.map((node) => [node.id, nodeHeight(node)]));
  const ids = doc.nodes.map((n) => n.id).sort(),
    out = new Map(ids.map((id) => [id, new Set()])),
    incoming = new Map(ids.map((id) => [id, new Set()]));
  for (const edge of doc.edges) {
    if (edge.source === edge.target || !out.has(edge.source) || !out.has(edge.target)) continue;
    out.get(edge.source).add(edge.target);
    incoming.get(edge.target).add(edge.source);
  }
  const alignment = new Map(ids.map((id) => [id, new Map()]));
  for (const edge of doc.edges) {
    if (!out.get(edge.source)?.has(edge.target)) continue;
    const offset = edgeOffsets.get(edge.id) || { source: 0, target: 0 };
    for (const [id, other, delta] of [
      [edge.source, edge.target, offset.target - offset.source],
      [edge.target, edge.source, offset.source - offset.target],
    ]) {
      if (!alignment.get(id).has(other)) alignment.get(id).set(other, new Set());
      alignment.get(id).get(other).add(delta);
    }
  }
  const alignedY = (id, other, positions) =>
    positions.get(other) + average([...alignment.get(id).get(other)]);
  const remaining = new Set(ids),
    rank = new Map(ids.map((id) => [id, 0])),
    sequence = [];
  while (remaining.size) {
    const candidates = [...remaining].filter(
      (id) => ![...incoming.get(id)].some((parent) => remaining.has(parent)),
    );
    // Break cycles only for layout; all original edges remain in the diagram.
    const id =
      candidates[0] ||
      [...remaining].sort((a, b) => {
        const score = (id) =>
          [...out.get(id)].filter((n) => remaining.has(n)).length -
          [...incoming.get(id)].filter((n) => remaining.has(n)).length;
        return score(b) - score(a) || a.localeCompare(b);
      })[0];
    remaining.delete(id);
    sequence.push(id);
    for (const child of out.get(id))
      if (remaining.has(child)) rank.set(child, Math.max(rank.get(child), rank.get(id) + 1));
  }
  // Sources with slack, such as analytics readers, sit near their consumers instead of at the far left.
  for (const id of [...sequence].reverse()) {
    const children = [...out.get(id)].filter((child) => rank.get(child) > rank.get(id));
    if (children.length)
      rank.set(
        id,
        Math.max(rank.get(id), Math.min(...children.map((child) => rank.get(child))) - 1),
      );
  }
  const ranks = [...new Set(rank.values())].sort((a, b) => a - b);
  const layers = ranks.map((value) => ids.filter((id) => rank.get(id) === value));
  const order = new Map();
  const remember = () =>
    layers.forEach((layer) => layer.forEach((id, i) => order.set(id, (i + 0.5) / layer.length)));
  remember();
  for (let pass = 0; pass < 8; pass++) {
    const forward = pass % 2 === 0;
    for (const layer of forward ? layers : [...layers].reverse()) {
      const score = (id) => {
        const neighbors = [...(forward ? incoming : out).get(id)].filter((other) =>
          forward ? rank.get(other) < rank.get(id) : rank.get(other) > rank.get(id),
        );
        return neighbors.length
          ? average(neighbors.map((other) => order.get(other)))
          : order.get(id);
      };
      layer.sort(
        (a, b) => score(a) - score(b) || order.get(a) - order.get(b) || a.localeCompare(b),
      );
      // Keep branches of the same nearest upstream resource contiguous, such as CDN buckets or API handlers.
      const branches = new Map();
      for (const id of layer) {
        const parents = [...incoming.get(id)].filter((parent) => rank.get(parent) < rank.get(id));
        const nearest = Math.max(-1, ...parents.map((parent) => rank.get(parent)));
        const key = parents.length
          ? JSON.stringify(parents.filter((parent) => rank.get(parent) === nearest).sort())
          : id;
        if (!branches.has(key)) branches.set(key, []);
        branches.get(key).push(id);
      }
      const blocks = [...branches.values()].sort(
        (a, b) =>
          average(a.map(score)) - average(b.map(score)) ||
          average(a.map((id) => order.get(id))) - average(b.map((id) => order.get(id))),
      );
      layer.splice(0, layer.length, ...blocks.flat());
      remember();
    }
  }
  const positions = new Map();
  for (const layer of layers) {
    let y = -layer.reduce((sum, id) => sum + heights.get(id) + rowGap, -rowGap) / 2;
    for (const id of layer) {
      positions.set(id, y + heights.get(id) / 2);
      y += heights.get(id) + rowGap;
    }
  }
  for (let pass = 0; pass < 12; pass++) {
    for (const layer of pass % 2 === 0 ? layers : [...layers].reverse()) {
      const desired = layer.map((id) => {
        const neighbors = [...new Set([...incoming.get(id), ...out.get(id)])];
        return neighbors.length
          ? average(neighbors.map((other) => alignedY(id, other, positions)))
          : positions.get(id);
      });
      compactRows(layer, desired, positions, heights, rowGap);
    }
  }
  for (const id of ids) {
    if (out.get(id).size || incoming.get(id).size !== 1) continue;
    const parent = [...incoming.get(id)][0],
      y = alignedY(id, parent, positions);
    if (Math.abs(positions.get(id) - y) > 30) continue;
    if (
      ids.every(
        (other) =>
          other === id ||
          rank.get(other) !== rank.get(id) ||
          Math.abs(positions.get(other) - y) >= (heights.get(id) + heights.get(other)) / 2 + rowGap,
      )
    )
      positions.set(id, y);
  }
  const columns = new Map();
  let x = 70;
  for (const [i, layer] of layers.entries()) {
    columns.set(ranks[i], x);
    const labels = doc.edges.filter(
      (edge) => layer.includes(edge.source) && rank.get(edge.target) > ranks[i],
    );
    const labelSpace = Math.min(
      260,
      Math.max(0, ...labels.map((edge) => (edge.label ?? edge.verb ?? '').length * 6.3 + 48)),
    );
    x += Math.max(...layer.map((id) => nodeWidth(byId.get(id)))) + Math.max(columnGap, labelSpace);
  }
  const top = Math.min(...ids.map((id) => positions.get(id) - heights.get(id) / 2));
  for (const node of doc.nodes) {
    node.x = columns.get(rank.get(node.id));
    node.y = 110 + Math.round((positions.get(node.id) - heights.get(node.id) / 2 - top) / 10) * 10;
  }
}
