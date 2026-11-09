import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, validateDocument } from '../diagram/model.js';
import { bendSegment, moveBend, translateManualRoutes } from '../diagram/manual-routing.js';
import { routeGraph } from '../diagram/routing.js';
import { connectorEdges } from '../diagram/diagram-presentation.js';
import { sizeGroups, sharedGroupBounds, withinBounds } from '../diagram/groups.js';

const fixture = () => ({
  version: 1,
  title: 'Manual routes',
  nodes: [
    { id: 'a', service: 'lambda', name: 'Worker', x: 40, y: 100 },
    { id: 'b', service: 'sqs', name: 'Queue', x: 500, y: 100 },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', verb: 'sends to' }],
});
const route = (graph) => routeGraph(graph).get('e');
function orthogonal(value) {
  assert.ok(value.points.length >= 2);
  for (const { a, b } of value.segments) {
    assert.ok(a.x === b.x || a.y === b.y);
    assert.notDeepEqual(a, b);
  }
}

// User detours retain attached endpoints, orthogonal segments, labels, and validated persistence.
test('manual bends survive document validation and follow moving endpoints', () => {
  const graph = fixture(),
    original = route(graph);
  graph.edges[0].waypoints = bendSegment(original.points, 0, { x: 350, y: 240 });
  assert.deepEqual(validateDocument(graph, ['lambda', 'sqs']), graph);
  const bent = route(graph);
  orthogonal(bent);
  assert.ok(bent.points.some((point) => point.y === 240));
  assert.deepEqual(bent.points[0], original.points[0]);
  assert.deepEqual(bent.points.at(-1), original.points.at(-1));
  assert.ok(bent.labelText);
  graph.nodes[1].y += 170;
  const moved = route(graph);
  orthogonal(moved);
  assert.deepEqual(moved.points.at(-1), { x: 500, y: 318 });
});

// Bend edits move neighboring tracks without moving either resource's attachment point.
test('moving a bend preserves endpoints and makes a new orthogonal route', () => {
  const graph = fixture();
  graph.edges[0].waypoints = bendSegment(route(graph).points, 0, { x: 350, y: 240 });
  const before = route(graph);
  graph.edges[0].waypoints = moveBend(before.points, 2, { x: 330, y: 280 });
  const after = route(graph);
  orthogonal(after);
  assert.deepEqual(after.points[0], before.points[0]);
  assert.deepEqual(after.points.at(-1), before.points.at(-1));
  assert.ok(after.points.some((point) => point.x === 330 && point.y === 280));
});

// Internal manual paths stay enclosed, and moving a whole group translates its bends with its cards.
test('group constraints and shared translations apply to manual routes', () => {
  const graph = fixture();
  graph.nodes.push({ id: 'g', service: 'group', name: 'Workers', x: 0, y: 0 });
  graph.nodes[0].groupId = graph.nodes[1].groupId = 'g';
  graph.edges[0].waypoints = [
    { x: -9999, y: -9999 },
    { x: 9999, y: 9999 },
  ];
  sizeGroups(graph);
  const enclosure = sharedGroupBounds(
    graph.nodes[0],
    graph.nodes[1],
    new Map(graph.nodes.map((node) => [node.id, node])),
  );
  assert.ok(route(graph).points.every((point) => withinBounds(point, enclosure)));
  const baseline = structuredClone(graph);
  graph.nodes.forEach((node) => {
    node.x += 100;
    node.y += 50;
  });
  translateManualRoutes(graph, baseline);
  assert.deepEqual(
    graph.edges[0].waypoints,
    baseline.edges[0].waypoints.map((point) => ({ x: point.x + 100, y: point.y + 50 })),
  );
});

// Invalid or excessive imported bends cannot reach SVG rendering or route calculations.
test('manual route validation rejects malformed coordinates and oversized paths', () => {
  for (const waypoints of [
    null,
    {},
    [{ x: Infinity, y: 0 }],
    [{ x: 0, y: 'bad' }],
    [{ x: 100001, y: 0 }],
    Array.from({ length: 101 }, () => ({ x: 0, y: 0 })),
  ]) {
    const graph = fixture();
    graph.edges[0].waypoints = waypoints;
    assert.throws(() => validateDocument(graph, ['lambda', 'sqs']), /Connector bends/);
  }
});

// Automatic arrangement intentionally replaces manual geometry for the whole diagram.
test('auto arrange resets manual paths', () => {
  const graph = fixture();
  graph.edges[0].waypoints = [{ x: 300, y: 300 }];
  arrange(graph);
  assert.equal(graph.edges[0].waypoints, undefined);
  orthogonal(route(graph));
});

// Read/write edges share a connector only while their saved manual geometry agrees.
test('combined read/write connectors preserve independent manual paths', () => {
  const edges = [
    { id: 'read', source: 'a', target: 'b', verb: 'reads from' },
    { id: 'write', source: 'a', target: 'b', verb: 'writes to' },
  ];
  assert.equal(connectorEdges(edges).length, 1);
  edges[0].waypoints = [{ x: 300, y: 200 }];
  assert.equal(connectorEdges(edges).length, 2);
  edges[1].waypoints = structuredClone(edges[0].waypoints);
  assert.equal(connectorEdges(edges).length, 1);
});

// Coincident ports keep a nonzero loop rather than producing NaN label coordinates.
test('manual routes remain renderable when endpoint ports coincide', () => {
  const graph = fixture();
  graph.nodes[1].x = graph.nodes[0].x;
  graph.nodes[1].y = graph.nodes[0].y;
  Object.assign(graph.edges[0], {
    verb: 'custom',
    label: 'connects',
    sourceSide: 'right',
    targetSide: 'right',
    waypoints: [],
  });
  const value = route(graph);
  orthogonal(value);
  assert.ok(Number.isFinite(value.x) && Number.isFinite(value.y));
  assert.ok(!value.d.includes('NaN'));
});

// Removing a detour corner collapses the redundant return track instead of leaving a doubled-back segment.
test('removing a bend does not leave a retraced detour', () => {
  const graph = fixture();
  const original = route(graph);
  graph.edges[0].waypoints = bendSegment(original.points, 0, { x: 350, y: 240 });
  const points = route(graph).points.slice(1, -1);
  points.splice(1, 1);
  graph.edges[0].waypoints = points;
  const removed = route(graph);
  orthogonal(removed);
  assert.deepEqual(removed.points, original.points);
});
