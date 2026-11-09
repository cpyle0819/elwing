import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagramRenderer } from '../render/svg-renderer.js';
import { starter } from '../diagram/model.js';
import { sizeGroups, sharedGroupBounds, withinBounds } from '../diagram/groups.js';
import { routeGraph } from '../diagram/routing.js';

const renderer = () => createDiagramRenderer({ serviceLabel: (node) => node.service });
const linePaths = (markup) =>
  [...markup.matchAll(/class="edge-line" d="([^"]+)"/g)].map((match) => match[1]);

// Rendering selection, previews, and export shares geometry without leaking interactive state between views.
test('renderer keeps geometry independent of selection and export controls', () => {
  const view = renderer(),
    graph = starter();
  const selected = view.render(graph, { selection: ['fn'] });
  const plain = view.render(graph);
  const exported = view.render(graph, {
    exporting: true,
    selection: ['fn'],
    markerId: 'export-arrow',
  });
  assert.match(selected, /aria-pressed="true"/);
  assert.doesNotMatch(plain, /aria-pressed="true"/);
  assert.doesNotMatch(exported, /aria-pressed="true"|class="edge-hit"|data-edit-label=/);
  assert.match(exported, /marker-end="url\(#export-arrow\)"/);
  assert.deepEqual(linePaths(selected), linePaths(plain));
  assert.deepEqual(linePaths(exported), linePaths(plain));
});

// A cached graph redraws moved endpoints and edited labels while user text remains escaped in SVG.
test('renderer invalidates geometry and escapes custom text', () => {
  const view = renderer(),
    graph = starter();
  const before = view.render(graph);
  graph.nodes.find((node) => node.id === 'fn').x += 80;
  graph.edges[0] = { ...graph.edges[0], verb: 'custom', label: '<script>alert("x")</script>' };
  const after = view.render(graph);
  assert.notDeepEqual(linePaths(after), linePaths(before));
  assert.doesNotMatch(after, /<script>/);
  assert.match(after, /&lt;script&gt;/);
  const exported = view.render(graph, { exporting: true });
  assert.match(exported, /&lt;script&gt;/);
  assert.deepEqual(linePaths(after), linePaths(exported));
});

// Resource descriptions wrap and expand in both the canvas and exported SVG.
test('service descriptions expand before truncating', () => {
  const view = renderer();
  const graph = starter();
  graph.nodes[0].name = 'Settings and implementations';
  for (const options of [{}, { exporting: true }]) {
    const markup = view.render(graph, options);
    assert.match(
      markup,
      /<tspan x="14" y="64">Settings and<\/tspan><tspan x="14" y="80">implementations<\/tspan>/,
    );
    assert.match(markup, /<title>Settings and implementations<\/title>/);
  }
  graph.nodes[0].name = 'Diagram revisions and custom resource library with icons';
  const markup = view.render(graph);
  const description = markup.match(/<title>Diagram revisions[^<]*<\/title>(.*?)<\/text>/s)[1];
  assert.equal(
    [...description.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((match) => match[1]).join(' '),
    graph.nodes[0].name,
  );
  assert.match(markup, /<title>Diagram revisions and custom resource library with icons<\/title>/);
});

const graph = () => ({
  nodes: [
    { id: 'a', service: 'lambda', name: 'A', x: 100, y: 100 },
    { id: 'b', service: 'sqs', name: 'B', x: 460, y: 100 },
    { id: 'c', service: 'lambda', name: 'C', x: 100, y: 400 },
    { id: 'd', service: 'sqs', name: 'D', x: 460, y: 400 },
  ],
  edges: [
    { id: 'ab', source: 'a', target: 'b', verb: 'sends to' },
    { id: 'cd', source: 'c', target: 'd', verb: 'sends to' },
  ],
});

// Moved graphs use complete routing for both settled renders and exports.
test('settled renders and exports use complete routing after movement', () => {
  const baseline = graph(),
    moved = structuredClone(baseline);
  const options = { serviceLabel: (node) => node.service };
  const renderer = createDiagramRenderer(options);
  renderer.render(baseline);
  moved.nodes[0].y += 80;
  assert.equal(renderer.render(moved), createDiagramRenderer(options).render(moved));
  assert.equal(
    renderer.render(moved, { exporting: true }),
    createDiagramRenderer(options).render(moved, { exporting: true }),
  );
});

// Large graphs retain exact bounds and export geometry without asynchronous routing.
test('large graph bounds and exports use exact routing', () => {
  const document = graph();
  for (let i = document.nodes.length; i < 40; i++)
    document.nodes.push({ id: `extra-${i}`, service: 'lambda', name: 'Extra', x: i * 220, y: 800 });
  const renderer = createDiagramRenderer({ serviceLabel: (node) => node.service });
  renderer.render(document);
  const reference = createDiagramRenderer({ serviceLabel: (node) => node.service });
  assert.deepEqual(renderer.bounds(document), reference.bounds(document));
  assert.equal(
    renderer.render(document, { exporting: true }),
    reference.render(document, { exporting: true }),
  );
});

// A custom type change invalidates geometry even when its endpoints and label are unchanged.
test('custom type updates refresh settled attachment sides', () => {
  const baseline = graph();
  baseline.edges[0] = {
    ...baseline.edges[0],
    verb: 'custom',
    label: 'data',
    connectionType: 'flow',
  };
  const edited = structuredClone(baseline);
  for (const [type, side] of [
    ['read', 'top'],
    ['reference', 'top'],
    ['write', 'left'],
  ]) {
    edited.edges[0].connectionType = type;
    assert.equal(routeGraph(edited).get('ab').targetSide, side);
  }
});

// All side pairs stay attached through settled routing, including group containment and reversed layouts.
test('custom endpoint sides work for all sixteen combinations', () => {
  for (const sourceSide of ['top', 'bottom', 'left', 'right'])
    for (const targetSide of ['top', 'bottom', 'left', 'right'])
      for (const [x, y] of [
        [400, 200],
        [-300, -180],
        [0, 250],
        [180, 0],
      ]) {
        const doc = sizeGroups({
          nodes: [
            { id: 'g', service: 'group', name: 'Group' },
            { id: 'a', x: 0, y: 0, groupId: 'g' },
            { id: 'b', x, y, groupId: 'g' },
          ],
          edges: [
            {
              id: 'e',
              source: 'a',
              target: 'b',
              verb: 'custom',
              label: 'calls',
              sourceSide,
              targetSide,
            },
          ],
        });
        const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
        const bounds = sharedGroupBounds(nodes.get('a'), nodes.get('b'), nodes);
        const settled = routeGraph(doc).get('e');
        assert.equal(settled.score[0], 0);
        for (const route of [settled]) {
          assert.equal(route.sourceSide, sourceSide);
          assert.equal(route.targetSide, targetSide);
          assert.ok(route.points.every((p) => withinBounds(p, bounds)));
          assert.ok(route.segments.every((s) => s.a.x === s.b.x || s.a.y === s.b.y));
          for (let i = 1; i < route.points.length - 1; i++) {
            const [a, b, c] = route.points.slice(i - 1, i + 2);
            assert.ok((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0, route.d);
          }
        }
      }
});
