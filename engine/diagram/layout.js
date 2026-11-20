import { nodeWidth, nodeHeight } from './groups.js';
import { badgeClearance } from './badge.js';
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
    const gap = Math.max(columnGap, labelSpace);
    // A badged card's overhang must also clear the next column; unbadged layouts are unchanged.
    x += Math.max(
      ...layer.map((id) => {
        const width = nodeWidth(byId.get(id));
        return width + Math.max(gap, badgeClearance(byId.get(id), width));
      }),
    );
  }
  const top = Math.min(...ids.map((id) => positions.get(id) - heights.get(id) / 2));
  for (const node of doc.nodes) {
    node.x = columns.get(rank.get(node.id));
    node.y = 110 + Math.round((positions.get(node.id) - heights.get(node.id) / 2 - top) / 10) * 10;
  }
}

// Depth-first back edges (loop-backs to an earlier step) are left out of layering.
function forwardEdges(doc) {
  const state = new Map(),
    back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const e of doc.edges.filter((e) => e.source === id)) {
      if (state.get(e.target) === 1) back.add(e.id);
      else if (!state.has(e.target)) visit(e.target);
    }
    state.set(id, 2);
  };
  const roots = doc.nodes.filter((n) => !doc.edges.some((e) => e.target === n.id));
  for (const n of [...roots, ...doc.nodes]) if (!state.has(n.id)) visit(n.id);
  return doc.edges.filter((e) => !back.has(e.id));
}

// Top-to-bottom flow chart arrange. Lays out a transposed copy (layers become rows),
// then keeps the Yes/first branch on a straight spine and moves "No" branches beside their decision.
export function arrangeFlowDown(doc, { rowGap = 64, siblingGap = 96 } = {}) {
  const proxy = {
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      service: 'custom',
      name: '',
      x: 0,
      y: 0,
      width: nodeHeight(n),
      height: nodeWidth(n),
    })),
    edges: forwardEdges(doc).map((e) => ({ ...e })),
  };
  arrangeLayered(proxy, { columnGap: rowGap, rowGap: siblingGap });
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const p of proxy.nodes) Object.assign(byId.get(p.id), { x: p.y, y: p.x });
  const cx = (n) => n.x + nodeWidth(n) / 2,
    cy = (n) => n.y + nodeHeight(n) / 2;
  const forward = (e) => byId.get(e.target).y > byId.get(e.source).y;
  const outgoing = (id) => doc.edges.filter((e) => e.source === id && forward(e));
  const isNo = (e) => /^no$/i.test(e.label ?? '');
  // Spine: from each root follow the Yes edge, else the first non-No edge.
  const roots = doc.nodes.filter((n) => !doc.edges.some((e) => e.target === n.id && forward(e)));
  const placed = new Set();
  for (const root of roots) {
    let node = root;
    while (node && !placed.has(node.id)) {
      placed.add(node.id);
      const out = outgoing(node.id);
      const next = out.find((e) => /^yes$/i.test(e.label ?? '')) ?? out.find((e) => !isNo(e));
      if (!next) break;
      const child = byId.get(next.target);
      if (!placed.has(child.id)) child.x = cx(root) - nodeWidth(child) / 2;
      node = child;
    }
  }
  // "No" targets sit on the decision's row, to its right.
  for (const edge of doc.edges.filter((e) => isNo(e) && forward(e))) {
    const d = byId.get(edge.source),
      t = byId.get(edge.target);
    if (placed.has(t.id)) continue;
    const dx = d.x + nodeWidth(d) + siblingGap - t.x,
      dy = cy(d) - nodeHeight(t) / 2 - t.y;
    // Move the whole No branch with its head, stopping where it rejoins the spine or meets
    // another branch: a step with an arrow from outside the branch is a join and stays put.
    const branch = [t.id];
    for (let i = 0; i < branch.length; i++)
      for (const e of outgoing(branch[i]))
        if (!placed.has(e.target) && !branch.includes(e.target)) branch.push(e.target);
    const incoming = (id) => doc.edges.filter((e) => e.target === id && forward(e));
    for (let pruned = true; pruned; ) {
      pruned = false;
      for (const id of branch.slice(1))
        if (incoming(id).some((e) => !branch.includes(e.source))) {
          branch.splice(branch.indexOf(id), 1);
          pruned = true;
        }
    }
    // Each step moves at most once, with the first branch that owns it.
    for (const id of branch) {
      const n = byId.get(id);
      n.x += dx;
      n.y += dy;
      placed.add(id);
    }
  }
  // Branch moves can land a step on another one; push the lower of each pair down a row.
  const settled = [];
  for (const n of [...doc.nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    for (let hit = true; hit; ) {
      const other = settled.find(
        (o) =>
          n.x < o.x + nodeWidth(o) &&
          o.x < n.x + nodeWidth(n) &&
          n.y < o.y + nodeHeight(o) &&
          o.y < n.y + nodeHeight(n),
      );
      hit = Boolean(other);
      if (other) n.y = other.y + nodeHeight(other) + rowGap;
    }
    settled.push(n);
  }
  const left = Math.min(...doc.nodes.map((n) => n.x));
  for (const n of doc.nodes) {
    n.x = Math.round(n.x - left + 70);
    n.y = Math.round(n.y);
  }
}
