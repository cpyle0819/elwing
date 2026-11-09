import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramExcalidraw } from '../diagram/excalidraw-export.js';
import { diagramSvg } from '../diagram/image-export.js';
import { createDiagramRenderer } from '../render/svg-renderer.js';
import { nodeWidth, nodeHeight } from '../diagram/groups.js';
import { connectorEdges } from '../diagram/diagram-presentation.js';

const graph = {
  version: 1,
  title: 'Editable architecture',
  nodes: [
    { id: 'group', service: 'group', name: 'Application', x: -40, y: -60 },
    { id: 'a', service: 'lambda', name: 'Process requests', x: 0, y: 0, groupId: 'group' },
    { id: 'b', service: 's3', name: 'Archive', x: 400, y: 160 },
    { id: 'a:icon', service: 'lambda', name: 'Other worker', x: 0, y: 300 },
    {
      id: 'custom',
      service: 'custom',
      name: 'External client',
      resourceName: 'Client',
      icon: 'data:image/png;base64,aWNvbg==',
      x: -300,
      y: 0,
    },
  ],
  edges: [
    { id: 'read', source: 'a', target: 'b', verb: 'reads from' },
    { id: 'write', source: 'a', target: 'b', verb: 'writes to' },
    {
      id: 'route',
      source: 'custom',
      target: 'a',
      verb: 'custom',
      label: 'Send request',
      color: '#123abc',
      waypoints: [{ x: -60, y: 80 }],
    },
  ],
};
const serviceLabel = (node) => node.service;
const renderer = createDiagramRenderer({ serviceLabel });
const options = {
  serviceLabel,
  updatedAt: '2026-11-09T00:00:00.000Z',
  iconData: { lambda: 'data:image/svg+xml;base64,bGFtYmRh', s3: 'data:image/svg+xml;base64,czM=' },
};
const cardId = (id) => `card:${JSON.stringify(id)}`;

test('scene preserves SVG geometry, visible connectors and reciprocal bindings without mutating input', () => {
  const before = structuredClone(graph);
  const svgBefore = diagramSvg(graph, renderer, options);
  const output = diagramExcalidraw(graph, renderer, options);
  const scene = JSON.parse(output.text);
  const normalized = structuredClone(graph);
  const routes = renderer.routes(normalized);
  assert.deepEqual(graph, before);
  assert.deepEqual(diagramSvg(graph, renderer, options), svgBefore);
  assert.equal(output.width, svgBefore.width);
  assert.equal(output.height, svgBefore.height);
  assert.equal(scene.type, 'excalidraw');
  assert.equal(scene.version, 2);
  assert.equal(scene.appState.viewBackgroundColor, '#f7f5ef');
  assert.equal(new Set(scene.elements.map((element) => element.id)).size, scene.elements.length);
  const byId = new Map(scene.elements.map((element) => [element.id, element]));
  for (const node of normalized.nodes) {
    const card = byId.get(cardId(node.id));
    assert.deepEqual(
      [card.x, card.y, card.width, card.height],
      [node.x, node.y, nodeWidth(node), nodeHeight(node)],
    );
    const members = scene.elements.filter((element) => element.groupIds.includes(card.groupIds[0]));
    assert.ok(members.some((element) => element.type === 'text'));
    assert.ok(members.every((element) => element.type !== 'arrow'));
  }
  const arrows = scene.elements.filter((element) => element.type === 'arrow');
  assert.equal(arrows.length, connectorEdges(graph.edges).length);
  for (const edge of connectorEdges(graph.edges)) {
    const arrow = byId.get(`edge:${JSON.stringify(edge.id)}`);
    assert.deepEqual(
      arrow.points.map(([x, y]) => ({ x: x + arrow.x, y: y + arrow.y })),
      routes.get(edge.id).points,
    );
    assert.equal(arrow.elbowed, false);
    for (const [binding, id] of [
      [arrow.startBinding, edge.source],
      [arrow.endBinding, edge.target],
    ]) {
      assert.equal(binding.elementId, cardId(id));
      assert.ok(byId.get(binding.elementId).boundElements.some((bound) => bound.id === arrow.id));
      assert.ok(Math.abs(binding.focus) <= 1);
      assert.ok(binding.gap >= 1, 'perimeter bindings must not use Excalidraw interior gap');
    }
    const label = byId.get(arrow.boundElements[0].id);
    assert.equal(label.containerId, arrow.id);
    const middle = Math.floor((arrow.points.length - 1) / 2);
    const a = arrow.points[middle];
    const b = arrow.points[middle + (arrow.points.length % 2 === 0 ? 1 : 0)];
    assert.equal(label.x + label.width / 2, arrow.x + (a[0] + b[0]) / 2);
    assert.equal(label.y + label.height / 2, arrow.y + (a[1] + b[1]) / 2);
  }
  assert.equal(byId.get('edge:"route"').strokeColor, '#123abc');
});

test('deduplicates embedded icons and uses stable element IDs, timestamps and scene bytes', () => {
  const output = diagramExcalidraw(graph, renderer, options);
  assert.equal(diagramExcalidraw(graph, renderer, options).text, output.text);
  assert.equal(
    diagramExcalidraw(graph, createDiagramRenderer({ serviceLabel }), options).text,
    output.text,
  );
  const scene = JSON.parse(output.text);
  const images = scene.elements.filter((element) => element.type === 'image');
  assert.equal(images.length, 4);
  assert.equal(Object.keys(scene.files).length, 3);
  assert.equal(
    scene.elements.every((element) => element.updated === Date.parse(options.updatedAt)),
    true,
  );
  for (const image of images)
    assert.ok(scene.files[image.fileId].dataURL.startsWith('data:image/'));
  assert.equal(images.find((image) => image.id === 'card:"custom":icon').width, 28);
  assert.equal(images.find((image) => image.id === 'card:"a":icon').width, 33);
});

test('route accessor cannot corrupt cached SVG routing', () => {
  const before = diagramSvg(graph, renderer, options);
  const routes = renderer.routes(structuredClone(graph));
  routes.get('read').points[0].x = 9999;
  routes.clear();
  assert.deepEqual(diagramSvg(graph, renderer, options), before);
});

test('empty scenes and multiline/custom cards serialize without deleted empty text', () => {
  for (const document of [
    { title: '', nodes: [], edges: [] },
    {
      title: 'Text',
      nodes: [{ id: 'n', service: 'custom', name: 'First\nSecond\n第三行', x: -900, y: -600 }],
      edges: [],
    },
  ]) {
    const output = diagramExcalidraw(document, renderer);
    const scene = JSON.parse(output.text);
    assert.ok(output.width > 0 && output.height > 0);
    assert.ok(scene.elements.every((element) => element.type !== 'text' || element.text.length));
    assert.ok(scene.elements.every((element) => element.updated === 0));
  }
});
