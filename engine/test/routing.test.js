import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sizeGroups, sharedGroupBounds, withinBounds } from '../diagram/groups.js';
import { routeGraph, segmentHitsCard, routingBounds } from '../diagram/routing.js';
const node = (id, x, y) => ({ id, x, y });
const edge = (id, source, target) => ({ id, source, target, verb: 'invokes' });
test('cached candidate scoring preserves fractional fan-out routes, scores and labels', () => {
  const nodes = Array.from({ length: 20 }, (_, i) => ({
    id: `n${i}`,
    x: (i % 5) * 310.1,
    y: Math.floor(i / 5) * 220.2,
    width: 164,
    height: 96,
  }));
  const edges = Array.from({ length: 100 }, (_, i) => ({
    id: `e${i}`,
    source: `n${Math.floor(i / 10)}`,
    target: `n${10 + (i % 10)}`,
    verb: 'writes to',
  }));
  // Captured from the uncached scorer, including all geometry, scores and label choices.
  const digest = createHash('sha256')
    .update(JSON.stringify([...routeGraph({ nodes, edges })]))
    .digest('hex');
  assert.equal(digest, '484dd79fa52dff1eae63ab09fd856278209ca6516021f9a4769bf8e422bf630f');
});
// Staggered S3 and Bedrock branches keep parallel strokes separated, including fractional drag positions.
test('nearby branches do not merge into a shared vertical or horizontal stroke', () => {
  for (const offset of [0, 0.1, 1, 2, 4, 8, 10])
    for (const rotate of [false, true]) {
      const nodes = [
        node('s3', 80 + offset, 40),
        node('bedrock', 80, 150),
        node('lambda', 500, 440),
      ];
      if (rotate)
        for (const n of nodes) {
          const { x, y } = n;
          n.x = (y * 164) / 96;
          n.y = (x * 96) / 164;
        }
      const graph = {
        nodes,
        edges: [
          { id: 'read', source: 'lambda', target: 's3', verb: 'reads from' },
          { id: 'invoke', source: 'lambda', target: 'bedrock', verb: 'invokes' },
        ],
      };
      const routes = routeGraph(graph),
        read = routes.get('read'),
        invoke = routes.get('invoke');
      for (const a of read.segments)
        for (const b of invoke.segments) {
          if (a.h !== b.h) continue;
          const fixed = a.h ? 'y' : 'x',
            along = a.h ? 'x' : 'y';
          const shared =
            Math.min(Math.max(a.a[along], a.b[along]), Math.max(b.a[along], b.b[along])) -
            Math.max(Math.min(a.a[along], a.b[along]), Math.min(b.a[along], b.b[along]));
          if (shared > 0)
            assert.ok(
              Math.abs(a.a[fixed] - b.a[fixed]) >= 6,
              JSON.stringify({ offset, rotate, read: read.points, invoke: invoke.points }),
            );
        }
      for (const route of routes.values()) assert.equal(route.score[0], 0);
      assert.deepEqual(routes, routeGraph({ ...graph, edges: [...graph.edges].reverse() }));
    }
});
// An intervening card is avoided using only horizontal and vertical line segments.
test('angular routes avoid intervening cards', () => {
  const obstacle = node('middle', 250, 0),
    g = { nodes: [node('a', 0, 0), obstacle, node('b', 500, 0)], edges: [edge('e', 'a', 'b')] };
  const r = routeGraph(g).get('e');
  assert.equal(r.score[0], 0);
  assert.ok(r.segments.every((s) => s.a.x === s.b.x || s.a.y === s.b.y));
  assert.ok(r.segments.every((s) => !segmentHitsCard(s, obstacle)));
  assert.ok(!r.d.includes('C'));
});
// Parallel and reverse relationships reserve separate channels and remain deterministic.
test('parallel and reverse arrows do not share lines', () => {
  const g = {
    nodes: [node('a', 0, 0), node('b', 400, 0)],
    edges: [edge('1', 'a', 'b'), edge('2', 'a', 'b'), edge('3', 'b', 'a')],
  };
  const routes = routeGraph(g);
  assert.deepEqual(routes, routeGraph(g));
  for (const r of routes.values()) {
    assert.equal(r.score[0], 0);
    assert.equal(r.score[1], 0);
  }
  assert.equal(new Set([...routes.values()].map((r) => JSON.stringify(r.points[0]))).size, 3);
});
// Fit and export bounds include detours and full relationship labels.
test('bounds include every route point and label', () => {
  const g = {
      nodes: [node('a', 0, 0), node('b', 0, 220)],
      edges: [edge('1', 'a', 'b'), edge('2', 'b', 'a')],
    },
    routes = routeGraph(g),
    bounds = routingBounds(g, routes);
  for (const r of routes.values()) {
    for (const p of r.points) {
      assert.ok(
        p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY,
      );
    }
    assert.ok(r.label.x >= bounds.minX && r.label.x + r.label.w <= bounds.maxX);
  }
});
// Fixed ports remain right-to-left in every layout; left-to-right aligned chains stay straight.
test('aligned chains keep standard input and output sides', () => {
  for (const [dx, dy] of [
    [300, 0],
    [-300, 0],
    [0, 200],
    [0, -200],
  ]) {
    const nodes = [node('a', 0, 0), node('b', dx, dy), node('c', dx * 2, dy * 2)];
    const graph = { nodes, edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')] };
    for (const route of routeGraph(graph).values()) {
      const source = nodes.find(
        (n) =>
          route.points[0].x === n.x + 164 &&
          route.points[0].y >= n.y &&
          route.points[0].y <= n.y + 96,
      );
      assert.ok(source);
      assert.equal(route.sourceSide, 'right');
      assert.equal(route.targetSide, 'left');
      assert.equal(route.score[0], 0);
      assert.equal(route.score[1], 0);
      if (dx > 0) assert.equal(route.segments.length, 1);
    }
  }
});
// A branch cannot displace the center attachment of an aligned connection; its offset avoids sharing that line.
test('aligned route retains the center when a card has a branch', () => {
  const g = {
      nodes: [node('a', 0, 0), node('b', 300, 0), node('c', 600, 0), node('branch', 310, 200)],
      edges: [edge('branch', 'b', 'branch'), edge('ab', 'a', 'b'), edge('bc', 'b', 'c')],
    },
    routes = routeGraph(g);
  assert.deepEqual(routes.get('ab').points, [
    { x: 164, y: 48 },
    { x: 300, y: 48 },
  ]);
  assert.deepEqual(routes.get('bc').points, [
    { x: 464, y: 48 },
    { x: 600, y: 48 },
  ]);
  for (const r of routes.values()) {
    assert.equal(r.score[0], 0);
    assert.equal(r.score[1], 0);
  }
});

// Close cards retain fixed ports without crossing cards, with direct lines for left-to-right flows.
test('close cards keep fixed ports in every direction', () => {
  for (const gap of [8, 14, 24, 32, 47])
    for (const [dx, dy] of [
      [164 + gap, 0],
      [-164 - gap, 0],
      [0, 96 + gap],
      [0, -96 - gap],
    ]) {
      const graph = { nodes: [node('a', 0, 0), node('b', dx, dy)], edges: [edge('ab', 'a', 'b')] };
      const route = routeGraph(graph).get('ab');
      assert.equal(route.sourceSide, 'right');
      assert.equal(route.targetSide, 'left');
      if (dx > 0) assert.equal(route.points.length, 2, `${dx},${dy}: ${route.d}`);
      assert.equal(route.score[0], 0);
    }
});

// Slight card offsets can share a straight attachment coordinate without moving either resource.
test('overlapping edge ranges support straight connections', () => {
  for (const [dx, dy] of [
    [240, 17],
    [-240, -17],
    [19, 160],
    [-19, -160],
  ]) {
    const graph = { nodes: [node('a', 0, 0), node('b', dx, dy)], edges: [edge('ab', 'a', 'b')] },
      before = structuredClone(graph);
    const route = routeGraph(graph).get('ab');
    if (dx > 164) assert.equal(route.segments.length, 1);
    assert.equal(route.sourceSide, 'right');
    assert.equal(route.targetSide, 'left');
    assert.equal(route.score[0], 0);
    assert.deepEqual(graph, before);
  }
});

// Reads use top ports, writes use left ports, and reverse calls retain separate right-to-left routes.
test('bidirectional service pairs keep operation-specific ports with branches', () => {
  const graph = {
    nodes: [node('lambda', 0, 0), node('s3', 220, 0), node('ddb', 0, 240)],
    edges: [
      { id: 'write', source: 'lambda', target: 's3', verb: 'writes to' },
      { id: 'invoke', source: 's3', target: 'lambda', verb: 'invokes' },
      { id: 'read', source: 'lambda', target: 's3', verb: 'reads from' },
      { id: 'branch', source: 'lambda', target: 'ddb', verb: 'writes to' },
    ],
  };
  const routes = routeGraph(graph),
    lanes = [];
  for (const id of ['write', 'invoke', 'read']) {
    const route = routes.get(id);
    if (id === 'write') assert.equal(route.segments.length, 1, id);
    assert.equal(route.score[0], 0);
    assert.equal(route.score[1], 0);
    lanes.push(route.points[0].y);
    assert.equal(route.points[0].x, id === 'invoke' ? 384 : 164);
    assert.equal(route.sourceSide, 'right');
    assert.equal(route.targetSide, id === 'read' ? 'top' : 'left');
  }
  assert.notEqual(lanes[0], lanes[2]);
  assert.deepEqual(routes, routeGraph({ ...graph, edges: [...graph.edges].reverse() }));
});

// Labels sit on their own segment, rotate with vertical lines, and stay inside the available gap.
test('labels align with connector segments instead of floating beside them', () => {
  for (const [dx, dy] of [
    [360, 0],
    [0, 240],
    [188, 0],
    [260, 170],
  ]) {
    const graph = {
        nodes: [node('a', 0, 0), node('b', dx, dy)],
        edges: [{ id: 'ab', source: 'a', target: 'b', verb: 'writes to' }],
      },
      route = routeGraph(graph).get('ab');
    assert.ok(route.labelText);
    const segment = route.segments.find((s) =>
      s.h
        ? route.y === s.a.y &&
          route.x >= Math.min(s.a.x, s.b.x) &&
          route.x <= Math.max(s.a.x, s.b.x)
        : route.x === s.a.x &&
          route.y >= Math.min(s.a.y, s.b.y) &&
          route.y <= Math.max(s.a.y, s.b.y),
    );
    assert.ok(segment);
    assert.equal(route.labelAngle, segment.h ? 0 : -90);
    if (dx === 188) assert.equal(route.labelText, '…');
    else assert.equal(route.labelText, 'writes to');
    for (const n of graph.nodes) {
      const box = route.label;
      assert.ok(
        box.x + box.w <= n.x || box.x >= n.x + 164 || box.y + box.h <= n.y || box.y >= n.y + 96,
      );
    }
  }
});

// Tight staggered cards never retrace an end segment as their horizontal offset changes.
test('staggered bidirectional connectors have no backtracking spurs', () => {
  const normals = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  for (const dx of [100, 128, 130, 140, 150, 160, 170, 180, 200])
    for (const dy of [104, 110, 120, 130, 140, 160, 200])
      for (const sign of [-1, 1]) {
        const graph = {
          nodes: [node('a', 0, 0), node('b', sign * dx, sign * dy)],
          edges: [edge('ab', 'a', 'b'), edge('ba', 'b', 'a')],
        };
        for (const route of routeGraph(graph).values()) {
          for (let i = 1; i < route.points.length - 1; i++) {
            const a = route.points[i - 1],
              b = route.points[i],
              c = route.points[i + 1];
            assert.ok((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0, route.d);
          }
          const first = route.segments[0],
            last = route.segments.at(-1),
            source = normals[route.sourceSide],
            target = normals[route.targetSide];
          assert.ok((first.b.x - first.a.x) * source[0] + (first.b.y - first.a.y) * source[1] > 0);
          assert.ok((last.b.x - last.a.x) * target[0] + (last.b.y - last.a.y) * target[1] < 0);
          assert.equal(route.score[0], 0, route.d);
        }
      }
});

// Close opposing bends keep both operation labels visible and separated along their connector segments.
test('staggered opposing arrows retain both labels', () => {
  const graph = {
      nodes: [node('a', 0, 0), node('b', 160, 130)],
      edges: [
        { id: 'write', source: 'a', target: 'b', verb: 'writes to' },
        { id: 'invoke', source: 'b', target: 'a', verb: 'invokes' },
      ],
    },
    routes = routeGraph(graph);
  assert.equal(routes.get('write').labelText, 'writes to');
  assert.equal(routes.get('invoke').labelText, 'invokes');
  const a = routes.get('write').label,
    b = routes.get('invoke').label;
  assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
});

// Crossing flows keep fixed ports without taking routes around the outer diagram bounds.
test('readable crossings preserve continuous paths without long perimeter detours', () => {
  const graph = {
    nodes: [
      node('left', 0, 300),
      node('right', 800, 300),
      node('top', 400, 0),
      node('bottom', 400, 600),
    ],
    edges: [edge('horizontal', 'left', 'right'), edge('vertical', 'top', 'bottom')],
  };
  const routes = routeGraph(graph);
  for (const route of routes.values()) {
    assert.equal(route.score[0], 0);
    assert.equal(route.score[1], 0);
    assert.equal(route.sourceSide, 'right');
    assert.equal(route.targetSide, 'left');
    assert.ok(route.segments.length <= 5);
  }
});

// Shared-group routes stay enclosed while avoiding an intervening card and separating reverse connections.
test('internal connectors stay inside fitted groups', () => {
  for (const vertical of [false, true]) {
    const members = [0, 1, 2].map((i) => ({
      ...node(String(i), vertical ? 100 : 100 + i * 250, vertical ? 100 + i * 180 : 100),
      groupId: 'g',
    }));
    const graph = sizeGroups({
      nodes: [{ id: 'g', service: 'group' }, ...members, node('outside', 1200, 900)],
      edges: [edge('forward', '0', '2'), edge('reverse', '2', '0'), edge('second', '0', '2')],
    });
    const bounds = sharedGroupBounds(
      members[0],
      members[2],
      new Map(graph.nodes.map((n) => [n.id, n])),
    );
    const routes = routeGraph(graph);
    for (const route of routes.values()) {
      assert.ok(
        route.points.every((p) => withinBounds(p, bounds)),
        JSON.stringify(route.points),
      );
      assert.equal(route.score[0], 0);
      assert.ok(route.segments.every((segment) => !segmentHitsCard(segment, members[1])));
    }
    assert.deepEqual(routes, routeGraph({ ...graph, edges: [...graph.edges].reverse() }));
  }
});

// Reference labels and combined read/write connectors preserve saved edge meaning while choosing ports.
test('references enter the top and combined operations enter the left', () => {
  const nodes = [node('a', 0, 0), node('b', 400, 200)];
  for (const [verb, combined, targetSide] of [
    ['reads from', false, 'top'],
    ['authorizes with', false, 'top'],
    ['subscribes to', false, 'top'],
    ['reads from', true, 'left'],
    ['custom', false, 'left'],
    ['invokes', false, 'left'],
  ]) {
    const graph = {
      nodes,
      edges: [{ id: 'e', source: 'a', target: 'b', verb, combined, label: 'lookup' }],
    };
    const before = structuredClone(graph);
    const route = routeGraph(graph).get('e');
    assert.equal(route.sourceSide, 'right');
    assert.equal(route.targetSide, targetSide);
    assert.equal(route.score[0], 0);
    assert.deepEqual(graph, before);
  }
});

// Nearby corridors keep a reference route local without sacrificing fixed ports, card clearance, or separate lanes.
test('crowded reference routes avoid perimeter detours', () => {
  const graph = JSON.parse(
    readFileSync(new URL('./fixtures/nearby-routing.json', import.meta.url)),
  );
  const before = structuredClone(graph);
  const routes = routeGraph(graph);
  const route = routes.get('e6');
  assert.ok(route.length < 1000, route.d);
  assert.equal(route.score[0], 0);
  assert.equal(route.score[1], 0);
  assert.equal(route.sourceSide, 'right');
  assert.equal(route.targetSide, 'top');
  assert.deepEqual(routes, routeGraph({ ...graph, edges: [...graph.edges].reverse() }));
  assert.deepEqual(graph, before);
});
