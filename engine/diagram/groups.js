import { resourceWidth, resourceHeight } from './resource-sizing.js';

// Resource clearance leaves room for connector approaches; the top also reserves the group title.
export const GROUP_PADDING = 48;
export const GROUP_TOP_PADDING = 80;

export const isGroup = (node) => node.service === 'group';
export const nodeWidth = (node) => (isGroup(node) ? node.width || 280 : resourceWidth(node));
export const nodeHeight = (node) => (isGroup(node) ? node.height || 180 : resourceHeight(node));

// Internal connectors stay inside the shared group with clearance from its border.
export function sharedGroupBounds(a, b, nodes) {
  const group = a.groupId && a.groupId === b.groupId ? nodes.get(a.groupId) : null;
  if (!group || !isGroup(group)) return null;
  return {
    left: group.x + 8,
    right: group.x + nodeWidth(group) - 8,
    top: group.y + 8,
    bottom: group.y + nodeHeight(group) - 8,
  };
}

export function withinBounds(point, bounds) {
  return (
    !bounds ||
    (point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom)
  );
}

// Titles can widen a narrow group to 360 units; member geometry remains the lower bound.
const titleWidth = (group) => Math.min(360, (group.name || '').length * 8 + 32);

// Every occupied group fits its members with space for the title and border.
export function sizeGroups(doc) {
  for (const group of doc.nodes.filter(isGroup)) {
    const members = doc.nodes.filter((n) => n.groupId === group.id);
    if (!members.length) {
      group.width = Math.max(280, titleWidth(group));
      group.height = 180;
      continue;
    }
    const right = Math.max(...members.map((n) => n.x + nodeWidth(n) + GROUP_PADDING));
    const bottom = Math.max(...members.map((n) => n.y + nodeHeight(n) + GROUP_PADDING));
    group.x = Math.min(...members.map((n) => n.x - GROUP_PADDING));
    group.y = Math.min(...members.map((n) => n.y - GROUP_TOP_PADDING));
    const contentWidth = right - group.x;
    group.width = Math.max(contentWidth, titleWidth(group));
    group.x -= (group.width - contentWidth) / 2;
    group.height = bottom - group.y;
  }
  return doc;
}

export function createGroup(doc, ids, id) {
  if (doc.nodes.length >= 200) throw Error('A diagram can contain up to 200 resources and groups.');
  const members = doc.nodes.filter((n) => ids.includes(n.id) && !isGroup(n));
  const group = {
    id,
    service: 'group',
    name: 'New group',
    x: 70,
    y: Math.max(0, ...doc.nodes.map((n) => n.y + nodeHeight(n))) + 60,
  };
  doc.nodes.push(group);
  for (const member of members) member.groupId = id;
  sizeGroups(doc);
  return group;
}

export function movingNodes(doc, ids) {
  return doc.nodes.filter((n) => ids.includes(n.id) || ids.includes(n.groupId));
}

const overlaps = (a, b, gap = 24) =>
  a.x < b.x + nodeWidth(b) + gap &&
  a.x + nodeWidth(a) + gap > b.x &&
  a.y < b.y + nodeHeight(b) + gap &&
  a.y + nodeHeight(a) + gap > b.y;

// Keep the active box anchored and move other groups, with their members, into the nearest free space.
export function separateGroups(doc, anchors = []) {
  sizeGroups(doc);
  const placed = [],
    groups = doc.nodes
      .filter(isGroup)
      .sort((a, b) => Number(anchors.includes(b.id)) - Number(anchors.includes(a.id)));
  for (const group of groups) {
    if (placed.some((other) => overlaps(group, other))) {
      const xs = [
        group.x,
        ...placed.flatMap((other) => [
          other.x - nodeWidth(group) - 24,
          other.x + nodeWidth(other) + 24,
        ]),
      ];
      const ys = [
        group.y,
        ...placed.flatMap((other) => [
          other.y - nodeHeight(group) - 24,
          other.y + nodeHeight(other) + 24,
        ]),
      ];
      let best = null;
      for (const x of xs)
        for (const y of ys) {
          const distance = (x - group.x) ** 2 + (y - group.y) ** 2;
          if (best && distance >= best.distance) continue;
          if (!placed.some((other) => overlaps({ ...group, x, y }, other)))
            best = { x, y, distance };
        }
      const dx = best.x - group.x,
        dy = best.y - group.y;
      for (const node of movingNodes(doc, [group.id])) {
        node.x += dx;
        node.y += dy;
      }
    }
    placed.push(group);
  }
  return doc;
}

export function hoveredGroup(doc, node) {
  return doc.nodes
    .filter(isGroup)
    .find(
      (g) =>
        node.x + nodeWidth(node) / 2 >= g.x &&
        node.x + nodeWidth(node) / 2 <= g.x + nodeWidth(g) &&
        node.y + nodeHeight(node) / 2 >= g.y + 39 &&
        node.y + nodeHeight(node) / 2 <= g.y + nodeHeight(g),
    );
}

// Preview uses a copy so leaving the canvas or canceling a drop restores every box and resource.
export function previewGroupDrop(doc, node, edge) {
  const graph = structuredClone(doc),
    placed = { ...node, preview: true },
    target = hoveredGroup(doc, node);
  if (target) placed.groupId = target.id;
  graph.nodes.push(placed);
  if (edge) graph.edges.push({ ...edge, id: 'resource-drop-preview', preview: true });
  separateGroups(graph, target ? [target.id] : []);
  if (target) graph.nodes.find((n) => n.id === target.id).dropTarget = true;
  return graph;
}

// Arrange each subsystem internally, then place its box as one unit in the outer graph.
export function arrangeGroups(doc, arrange) {
  const groups = doc.nodes.filter(isGroup);
  for (const group of groups) {
    const members = doc.nodes.filter((n) => n.groupId === group.id),
      ids = new Set(members.map((n) => n.id));
    arrange({
      nodes: members,
      edges: doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    });
  }
  sizeGroups(doc);
  const outer = doc.nodes.filter((n) => !n.groupId).map((n) => ({ ...n }));
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const offset = (id) => {
    const node = byId.get(id),
      group = byId.get(node?.groupId);
    return group ? node.y + nodeHeight(node) / 2 - group.y - nodeHeight(group) / 2 : 0;
  };
  const edgeOffsets = new Map(
    doc.edges.map((edge) => [
      edge.id,
      { source: offset(edge.source), target: offset(edge.target) },
    ]),
  );
  arrange(
    {
      nodes: outer,
      edges: doc.edges
        .map((e) => ({
          ...e,
          source: doc.nodes.find((n) => n.id === e.source)?.groupId || e.source,
          target: doc.nodes.find((n) => n.id === e.target)?.groupId || e.target,
        }))
        .filter((e) => e.source !== e.target),
    },
    { columnGap: 190, rowGap: 160, edgeOffsets },
  );
  for (const item of outer) {
    const original = doc.nodes.find((node) => node.id === item.id);
    const dx = item.x - original.x,
      dy = item.y - original.y;
    for (const node of movingNodes(doc, [item.id])) {
      node.x += dx;
      node.y += dy;
    }
  }
  sizeGroups(doc);
}
