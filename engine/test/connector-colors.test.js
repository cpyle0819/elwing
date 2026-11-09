import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignConnectorColors,
  connectorBackgrounds,
  contrastRatio,
} from '../diagram/connector-colors.js';
import { connectorEdges } from '../diagram/diagram-presentation.js';

function assertUniqueAtEndpoints(edges, colors) {
  const seen = new Map();
  for (const edge of edges) {
    for (const id of [edge.source, edge.target]) {
      const previous = seen.get(id) || [];
      for (const theme of ['light', 'dark'])
        assert.ok(!previous.includes(colors.get(edge.id)[theme]), `${id} repeats a ${theme} color`);
      previous.push(colors.get(edge.id).light, colors.get(edge.id).dark);
      seen.set(id, previous);
    }
  }
}

// Reverse, parallel, cyclic, and group connections all reserve colors at both endpoints.
test('incident connectors always have different colors', () => {
  const edges = [];
  for (let source = 0; source < 12; source++)
    for (let target = 0; target < 12; target++)
      if (source !== target)
        edges.push({ id: `${source}-${target}`, source: `n${source}`, target: `n${target}` });
  edges.push({ id: 'parallel', source: 'n0', target: 'n1' });
  assertUniqueAtEndpoints(edges, assignConnectorColors(edges));
});

// A high-degree resource expands the palette instead of wrapping back to an already used color.
test('palette supports one thousand touching connectors with readable contrast', () => {
  const edges = Array.from({ length: 1000 }, (_, index) => ({
    id: String(index),
    source: 'hub',
    target: `n${index % 199}`,
  }));
  const colors = assignConnectorColors(edges);
  assertUniqueAtEndpoints(edges, colors);
  for (const color of colors.values())
    for (const [theme, backgrounds] of Object.entries(connectorBackgrounds))
      for (const background of backgrounds)
        assert.ok(contrastRatio(color[theme], background) >= 4.5);
});

// Color assignment depends on visible topology, not resource positions or input iteration order.
test('colors are stable across movement and edge array reordering', () => {
  const edges = [
    { id: 'a', source: 'one', target: 'two' },
    { id: 'b', source: 'two', target: 'three' },
    { id: 'c', source: 'three', target: 'one' },
  ];
  assert.deepEqual(assignConnectorColors(edges), assignConnectorColors([...edges].reverse()));
});

// An existing read/write pair has one visible connector and therefore reserves one color at each endpoint.
test('combined read/write connectors use one visible color assignment', () => {
  const edges = connectorEdges([
    { id: 'read', source: 'worker', target: 'table', verb: 'reads from' },
    { id: 'write', source: 'worker', target: 'table', verb: 'writes to' },
    { id: 'other', source: 'worker', target: 'queue', verb: 'sends to' },
  ]);
  assert.equal(edges.length, 2);
  assertUniqueAtEndpoints(edges, assignConnectorColors(edges));
});
