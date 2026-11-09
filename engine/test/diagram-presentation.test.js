import test from 'node:test';
import assert from 'node:assert/strict';
import { connectorEdges, connectionContext } from '../diagram/diagram-presentation.js';

// Only same-direction documented read/write pairs combine, with both source IDs retained.
test('combined connectors preserve individual edges and opposing operations', () => {
  const edges = [
      { id: 'read', source: 'fn', target: 'db', verb: 'reads from' },
      { id: 'write', source: 'fn', target: 'db', verb: 'writes to' },
      { id: 'reverse', source: 'db', target: 'fn', verb: 'invokes' },
      { id: 'custom', source: 'fn', target: 'db', verb: 'custom', label: 'reads from' },
    ],
    before = structuredClone(edges),
    visible = connectorEdges(edges);
  assert.equal(visible.length, 3);
  assert.deepEqual(visible[0].edgeIds, ['read', 'write']);
  assert.equal(visible[0].label, 'reads / writes');
  assert.equal(visible[1].id, 'reverse');
  assert.equal(visible[2].id, 'custom');
  assert.deepEqual(edges, before);
});

// Deleting or customizing either relationship restores ordinary connectors; previews never join saved edges.
test('combined connectors split when either operation changes', () => {
  const read = { id: 'read', source: 'fn', target: 'db', verb: 'reads from' },
    write = { id: 'write', source: 'fn', target: 'db', verb: 'writes to' };
  assert.equal(connectorEdges([read])[0].combined, undefined);
  assert.equal(
    connectorEdges([read, { ...write, verb: 'custom', label: 'writes records' }]).length,
    2,
  );
  assert.equal(connectorEdges([read, { ...write, preview: true }]).length, 2);
});

// Outgoing emphasis stays one hop instead of expanding into unrelated downstream paths.
test('connection emphasis keeps unrelated paths dim', () => {
  const graph = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
    ],
  };
  const context = connectionContext(graph, ['a']);
  assert.deepEqual([...context.nodes], ['a', 'b']);
  assert.deepEqual([...context.edges], ['ab']);
  assert.deepEqual([...connectionContext(graph, [], ['bc']).nodes], ['b', 'c']);
});

// Group focus includes member connections and keeps containing boxes visible for highlighted endpoints.
test('group emphasis includes its members', () => {
  const graph = {
    nodes: [{ id: 'g', service: 'group' }, { id: 'a', groupId: 'g' }, { id: 'b' }],
    edges: [{ id: 'ab', source: 'a', target: 'b' }],
  };
  assert.deepEqual([...connectionContext(graph, ['g']).edges], ['ab']);
  assert.ok(connectionContext(graph, [], ['ab']).nodes.has('g'));
});

// Every incoming branch reaches its root, without lighting sibling branches of those ancestors.
test('resource emphasis follows all upstream roots', () => {
  const graph = {
    nodes: ['root', 'other', 'api', 'fn', 'db', 'sibling'].map((id) => ({ id })),
    edges: [
      { id: 'entry', source: 'root', target: 'api' },
      { id: 'second', source: 'other', target: 'api' },
      { id: 'call', source: 'api', target: 'fn' },
      { id: 'write', source: 'fn', target: 'db' },
      { id: 'unrelated', source: 'api', target: 'sibling' },
    ],
  };
  const context = connectionContext(graph, ['fn']);
  assert.deepEqual([...context.edges].sort(), ['entry', 'second', 'call', 'write'].sort());
  assert.ok(context.nodes.has('root'));
  assert.ok(context.nodes.has('other'));
  assert.ok(context.nodes.has('db'));
  assert.ok(!context.nodes.has('sibling'));
});

// Cycles terminate, and upstream group connections are included for a member resource.
test('upstream emphasis handles cycles and containing groups', () => {
  const graph = {
    nodes: [
      { id: 'root' },
      { id: 'group', service: 'group' },
      { id: 'a', groupId: 'group' },
      { id: 'b', groupId: 'group' },
    ],
    edges: [
      { id: 'boundary', source: 'root', target: 'group' },
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ba', source: 'b', target: 'a' },
    ],
  };
  assert.deepEqual([...connectionContext(graph, ['b']).edges].sort(), ['ab', 'ba', 'boundary']);
});

// Crossing gaps preserve geometry and keep highlighted paths continuous across dimmed paths.
test('crossing gaps distinguish independent paths without creating junctions', async () => {
  const { connectorCrossings } = await import('../diagram/diagram-presentation.js');
  const { segments } = await import('../diagram/routing.js');
  const route = (points) => ({ points, segments: segments(points) });
  const routes = new Map([
    [
      'horizontal',
      route([
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ]),
    ],
    [
      'vertical',
      route([
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ]),
    ],
    [
      'endpoint',
      route([
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
    ],
    [
      'bend',
      route([
        { x: 0, y: 50 },
        { x: 0, y: 100 },
      ]),
    ],
  ]);
  const before = structuredClone(routes);
  assert.deepEqual([...connectorCrossings(routes)], [['vertical', [{ x: 50, y: 50 }]]]);
  assert.deepEqual([...connectorCrossings(routes, new Set(['vertical']))], []);
  assert.deepEqual(
    [...connectorCrossings(routes, new Set(['vertical', 'horizontal']))],
    [['vertical', [{ x: 50, y: 50 }]]],
  );
  assert.deepEqual(
    [...connectorCrossings(routes, new Set(['horizontal']))],
    [['vertical', [{ x: 50, y: 50 }]]],
  );
  assert.deepEqual(routes, before);
});

// Gaps follow path direction, merge nearby crossings, and leave continuous strokes up to both resource ports.
test('crossing dash intervals preserve endpoints in both directions', async () => {
  const { crossingDashes } = await import('../diagram/diagram-presentation.js');
  const { segments } = await import('../diagram/routing.js');
  for (const points of [
    [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    [
      { x: 50, y: 100 },
      { x: 50, y: 0 },
    ],
  ]) {
    const route = { segments: segments(points) };
    assert.equal(crossingDashes(route, [{ x: 50, y: 50 }]), '46 8 46 101');
    const dashes = crossingDashes(route, [
      { x: 50, y: 49 },
      { x: 50, y: 51 },
    ])
      .split(' ')
      .map(Number);
    assert.equal(dashes.length, 4);
    assert.equal(dashes[1], 10);
    assert.equal(dashes[0] + dashes[1] + dashes[2], 100);
    assert.ok(dashes[0] > 0 && dashes[2] > 0);
  }
});
