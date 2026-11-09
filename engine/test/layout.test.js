import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrange } from '../diagram/model.js';
const fixture = () =>
  JSON.parse(readFileSync(new URL('./fixtures/game-backend.json', import.meta.url), 'utf8'));
const distance = (graph) =>
  graph.edges.reduce((sum, edge) => {
    const a = graph.nodes.find((n) => n.id === edge.source),
      b = graph.nodes.find((n) => n.id === edge.target);
    return sum + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }, 0);

// The supplied game architecture keeps all semantics while shortening connections and separating cards.
test('game backend layout brings services and their stores together', () => {
  const graph = fixture(),
    before = structuredClone(graph);
  arrange(graph);
  assert.ok(distance(graph) < distance(before) * 0.65);
  assert.deepEqual(graph.edges, before.edges);
  for (const node of graph.nodes) {
    const { x, y, ...rest } = node,
      old = before.nodes.find((n) => n.id === node.id);
    assert.deepEqual(
      rest,
      Object.fromEntries(Object.entries(old).filter(([key]) => !['x', 'y'].includes(key))),
    );
    for (const other of graph.nodes)
      if (other !== node)
        assert.ok(
          node.x + 164 <= other.x ||
            other.x + 164 <= node.x ||
            node.y + 96 <= other.y ||
            other.y + 96 <= node.y,
        );
  }
  for (const [source, target] of [
    ['profilefn', 'profileddb'],
    ['inventoryfn', 'inventoryddb'],
  ]) {
    assert.equal(
      graph.nodes.find((n) => n.id === source).y,
      graph.nodes.find((n) => n.id === target).y,
    );
  }
});

// Repeated arrangement and changed serialization order produce the same resource positions.
test('layout is stable across repeated runs and input ordering', () => {
  const graph = fixture();
  arrange(graph);
  const positions = (g) =>
    Object.fromEntries(
      [...g.nodes].sort((a, b) => a.id.localeCompare(b.id)).map((n) => [n.id, [n.x, n.y]]),
    );
  const expected = positions(graph);
  arrange(graph);
  assert.deepEqual(positions(graph), expected);
  const reversed = fixture();
  reversed.nodes.reverse();
  reversed.edges.reverse();
  arrange(reversed);
  assert.deepEqual(positions(reversed), expected);
});

// Column spacing reserves enough room for meaningful labels without changing the graph's relationships.
test('arrangement leaves a readable corridor for longer relationship labels', () => {
  const doc = {
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 0 },
    ],
    edges: [
      { id: 'ab', source: 'a', target: 'b', verb: 'custom', label: 'publishes domain events' },
    ],
  };
  const before = structuredClone(doc.edges);
  arrange(doc);
  assert.ok(doc.nodes[1].x - doc.nodes[0].x - 164 >= doc.edges[0].label.length * 6.3 + 32);
  assert.equal(doc.nodes[0].y, doc.nodes[1].y);
  assert.deepEqual(doc.edges, before);
});
