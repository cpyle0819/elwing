import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGroup,
  sizeGroups,
  movingNodes,
  nodeWidth,
  nodeHeight,
  separateGroups,
  previewGroupDrop,
} from '../diagram/groups.js';
import {
  starter,
  validateDocument,
  removeNode,
  arrange,
  addRelationship,
} from '../diagram/model.js';
import { routeGraph } from '../diagram/routing.js';
import { catalogGraph } from '../catalog/catalog-graph.js';
import { applyOperations } from '../operations/diagram-operations.js';
const services = ['cloudfront', 'apigateway', 'lambda', 'dynamodb', 's3', 'sqs'];

// Group membership survives serialization, and its border encloses every member.
test('groups enclose members and survive document validation', () => {
  const doc = starter(),
    group = createGroup(doc, ['api', 'fn'], 'system');
  const saved = validateDocument(JSON.parse(JSON.stringify(doc)), services);
  assert.equal(saved.nodes.find((n) => n.id === 'fn').groupId, group.id);
  for (const node of doc.nodes.filter((n) => n.groupId === group.id)) {
    assert.ok(node.x > group.x && node.y > group.y + 39);
    assert.ok(node.x + 164 < group.x + group.width && node.y + 96 < group.y + group.height);
  }
  assert.equal(movingNodes(doc, [group.id, 'fn']).length, 3);
});

// Removing a group preserves its resources and internal edges, removing only boundary connections.
test('ungroup preserves resources and internal relationships', () => {
  const doc = starter();
  createGroup(doc, ['api', 'fn'], 'system');
  createGroup(doc, ['db'], 'data');
  addRelationship(doc, 'system', 'custom', 'data', 'boundary', 'stores orders');
  removeNode(doc, 'system');
  assert.equal(doc.nodes.find((n) => n.id === 'fn').groupId, undefined);
  assert.ok(doc.edges.some((e) => e.id === 'e2'));
  assert.ok(!doc.edges.some((e) => e.id === 'boundary'));
  validateDocument(doc, services);
});

// Invalid membership and nested groups cannot enter saved diagrams.
test('group membership rejects missing parents and nesting', () => {
  const doc = starter();
  createGroup(doc, ['fn'], 'system');
  doc.nodes.find((n) => n.id === 'system').groupId = 'system';
  assert.throws(() => validateDocument(doc, services), /Nested groups/);
  delete doc.nodes.find((n) => n.id === 'system').groupId;
  doc.nodes.find((n) => n.id === 'fn').groupId = 'missing';
  assert.throws(() => validateDocument(doc, services), /existing group/);
});

// Layout treats each group as one unit and routes boundary edges onto actual box borders.
test('group layout and connector ports use full group dimensions', () => {
  const doc = starter();
  createGroup(doc, ['api', 'fn', 'queue'], 'system');
  createGroup(doc, ['db', 'assets'], 'data');
  addRelationship(doc, 'system', 'custom', 'data', 'boundary', 'stores data');
  arrange(doc);
  sizeGroups(doc);
  const a = doc.nodes.find((n) => n.id === 'system'),
    b = doc.nodes.find((n) => n.id === 'data');
  assert.ok(
    a.x + nodeWidth(a) <= b.x ||
      b.x + nodeWidth(b) <= a.x ||
      a.y + nodeHeight(a) <= b.y ||
      b.y + nodeHeight(b) <= a.y,
  );
  const route = routeGraph(doc).get('boundary');
  for (const [point, node] of [
    [route.points[0], a],
    [route.points.at(-1), b],
  ]) {
    assert.ok(
      point.x === node.x ||
        point.x === node.x + nodeWidth(node) ||
        point.y === node.y ||
        point.y === node.y + nodeHeight(node),
    );
  }
});

// Diagram edits retain group membership and boundary relationships.
test('diagram edits preserve groups', () => {
  const doc = starter();
  createGroup(doc, ['api', 'fn'], 'system');
  createGroup(doc, ['db'], 'data');
  addRelationship(doc, 'system', 'custom', 'data', 'boundary', 'stores orders');
  const result = applyOperations(doc, [{ op: 'rename_diagram', title: 'Renamed' }], services);
  assert.equal(result.title, 'Renamed');
  assert.equal(result.nodes.find((n) => n.id === 'fn').groupId, 'system');
  assert.deepEqual(result.edges, doc.edges);
});

// Collision resolution preserves the active box and each displaced group's internal geometry.
test('groups make room without overlapping or splitting members', () => {
  const doc = starter();
  createGroup(doc, ['api', 'fn'], 'system');
  createGroup(doc, ['db', 'queue'], 'data');
  const before = structuredClone(doc),
    anchor = doc.nodes.find((n) => n.id === 'data');
  separateGroups(doc, ['data']);
  assert.equal(anchor.x, before.nodes.find((n) => n.id === 'data').x);
  const groups = doc.nodes.filter((n) => n.service === 'group'),
    [a, b] = groups;
  assert.ok(
    a.x + a.width + 24 <= b.x ||
      b.x + b.width + 24 <= a.x ||
      a.y + a.height + 24 <= b.y ||
      b.y + b.height + 24 <= a.y,
  );
  const dx = doc.nodes.find((n) => n.id === 'api').x - before.nodes.find((n) => n.id === 'api').x;
  assert.equal(
    doc.nodes.find((n) => n.id === 'fn').x - before.nodes.find((n) => n.id === 'fn').x,
    dx,
  );
  const stable = structuredClone(doc);
  separateGroups(doc, ['data']);
  assert.deepEqual(doc, stable);
});

// Hover expands a group and clears room without mutating the saved graph or assigning membership early.
test('resource hover previews group growth without changing its source', () => {
  const doc = starter();
  createGroup(doc, ['api', 'fn'], 'system');
  separateGroups(doc);
  const before = structuredClone(doc),
    group = doc.nodes.find((n) => n.id === 'system');
  const node = {
    id: 'hover',
    service: 's3',
    name: 'New bucket',
    x: group.x + group.width - 84,
    y: group.y + 60,
  };
  const preview = previewGroupDrop(doc, node),
    expanded = preview.nodes.find((n) => n.id === 'system');
  assert.ok(expanded.width > group.width);
  assert.equal(preview.nodes.find((n) => n.id === 'hover').groupId, 'system');
  assert.equal(expanded.dropTarget, true);
  assert.deepEqual(doc, before);
  const away = previewGroupDrop(doc, { ...node, x: group.x + group.width + 200 });
  assert.equal(away.nodes.find((n) => n.id === 'system').width, group.width);
  assert.equal(away.nodes.find((n) => n.id === 'hover').groupId, undefined);
});

// The first resource defines the fitted frame, and preview geometry matches the committed result.
test('empty group hover fits its first resource', () => {
  const doc = {
    version: 1,
    title: 'Empty group',
    nodes: [
      { id: 'group', service: 'group', name: 'System', x: 100, y: 100, width: 280, height: 180 },
    ],
    edges: [],
  };
  const preview = previewGroupDrop(doc, {
    id: 'new',
    service: 'lambda',
    name: 'Function',
    x: 295,
    y: 150,
  });
  const group = preview.nodes.find((n) => n.id === 'group');
  assert.equal(group.x, 295 - 48);
  assert.equal(group.y, 150 - 80);
  assert.equal(group.width, 260);
  assert.equal(group.height, 224);
  const placed = structuredClone(preview);
  for (const node of placed.nodes) {
    delete node.preview;
    delete node.dropTarget;
  }
  separateGroups(placed);
  assert.equal(placed.nodes.find((n) => n.id === 'group').width, group.width);
});

// Moving or removing outer members shrinks a group without needing Auto arrange.
test('groups shrink to current member bounds', () => {
  const doc = starter(),
    group = createGroup(doc, ['api', 'fn'], 'system');
  const wide = group.width;
  doc.nodes.find((n) => n.id === 'fn').x -= 100;
  sizeGroups(doc);
  assert.equal(group.width, wide - 100);
  removeNode(doc, 'fn');
  assert.equal(group.width, 260);
  assert.equal(group.height, 224);
  assert.equal(group.x, doc.nodes.find((n) => n.id === 'api').x - 48);
});

// The catalog group example is accepted by the document validator.
test('catalog group examples use the supported document shape', () => {
  const catalog = catalogGraph();
  const proposal = { version: 1, title: 'Two systems', ...catalog.diagramPrimitives.groupExample };
  const result = validateDocument(proposal, services);
  separateGroups(result);
  validateDocument(result, services);
  assert.equal(result.nodes.filter((n) => n.service === 'group').length, 2);
  assert.equal(result.nodes.find((n) => n.id === 'worker').groupId, 'app');
  assert.deepEqual(result.edges[0], {
    id: 'system-link',
    source: 'app',
    target: 'events',
    verb: 'custom',
    label: 'sends events',
  });
});

// Group membership edits preserve concrete resources and connections.
test('diagram edits can move and ungroup resources without losing their identities', () => {
  const base = starter();
  createGroup(base, ['api', 'fn'], 'app');
  createGroup(base, ['queue'], 'events');
  let result = applyOperations(
    base,
    [{ op: 'upsert_node', id: 'fn', groupId: 'events' }],
    services,
  );
  assert.equal(result.nodes.find((n) => n.id === 'fn').groupId, 'events');
  assert.deepEqual(result.edges, base.edges);
  result = applyOperations(result, [{ op: 'remove_node', id: 'events' }], services);
  assert.ok(result.nodes.some((n) => n.id === 'fn'));
  assert.ok(result.nodes.some((n) => n.id === 'queue'));
  assert.equal(result.nodes.find((n) => n.id === 'fn').groupId, undefined);
  assert.deepEqual(result.edges, base.edges);
});

// Group containers do not relax the pair catalog for connections between their member resources.
test('diagram edits reject undocumented member connections and nested groups', () => {
  const base = starter();
  createGroup(base, ['api', 'fn'], 'app');
  assert.throws(
    () =>
      applyOperations(
        base,
        [{ op: 'upsert_edge', id: 'invalid', source: 'api', target: 'fn', verb: 'subscribes to' }],
        services,
      ),
    /not documented/,
  );
  const nested = structuredClone(base);
  nested.nodes.find((n) => n.id === 'app').groupId = 'app';
  assert.throws(() => validateDocument(nested, services), /Nested groups/);
});

// Different-size groups align the resources that actually communicate, while retaining fitted, separate boxes.
test('group arrangement follows member connection rows and remains stable', () => {
  const doc = {
    version: 1,
    title: 'Systems',
    nodes: ['first', 'middle', 'last', 'target'].map((id) => ({
      id,
      service: 'custom',
      name: id,
      x: 0,
      y: 0,
    })),
    edges: [
      { id: 'request', source: 'first', target: 'target', verb: 'custom', label: 'sends events' },
    ],
  };
  createGroup(doc, ['first', 'middle', 'last'], 'source-group');
  createGroup(doc, ['target'], 'target-group');
  arrange(doc);
  const get = (id) => doc.nodes.find((n) => n.id === id);
  assert.ok(Math.abs(get('first').y - get('target').y) <= 10);
  assert.ok(get('target-group').x >= get('source-group').x + nodeWidth(get('source-group')) + 190);
  const before = structuredClone(doc);
  arrange(doc);
  assert.deepEqual(doc, before);
});

// Title-driven widths stay capped, centered over members, and reversible without moving resources.
test('narrow groups fit normal titles and cap long-title expansion', () => {
  const doc = {
    nodes: [
      { id: 'g', service: 'group', name: 'Customer notification processing', x: 0, y: 0 },
      { id: 'a', service: 'lambda', groupId: 'g', x: 100, y: 100 },
      { id: 'b', service: 'sqs', groupId: 'g', x: 100, y: 300 },
    ],
    edges: [],
  };
  const group = doc.nodes[0];
  const members = structuredClone(doc.nodes.slice(1));
  sizeGroups(doc);
  assert.ok(group.width > 260 && group.width <= 360);
  assert.equal(group.x + group.width / 2, 182);
  const fitted = structuredClone(doc);
  sizeGroups(doc);
  assert.deepEqual(doc, fitted);
  group.name = 'Very long title '.repeat(20);
  sizeGroups(doc);
  assert.equal(group.width, 360);
  group.name = 'Jobs';
  sizeGroups(doc);
  assert.equal(group.width, 260);
  assert.deepEqual(doc.nodes.slice(1), members);
  doc.nodes[2].x = 700;
  sizeGroups(doc);
  assert.ok(group.width > 360);
  doc.nodes = [group];
  group.name = 'Very long title '.repeat(20);
  sizeGroups(doc);
  assert.equal(group.width, 360);
});
