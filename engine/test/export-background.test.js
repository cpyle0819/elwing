import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramSvg, normalizeBackground } from '../diagram/image-export.js';
import { createDiagramRenderer } from '../render/svg-renderer.js';

const serviceLabel = (node) => node.service;
const renderer = createDiagramRenderer({ serviceLabel });
const graph = {
  version: 1,
  title: 'Background',
  nodes: [
    { id: 'group', service: 'group', name: 'Application', x: -40, y: -60 },
    { id: 'a', service: 'lambda', name: 'Worker', x: 0, y: 0, groupId: 'group' },
    { id: 'b', service: 's3', name: 'Archive', x: 420, y: 0 },
    { id: 'c', service: 'custom', name: 'Client', resourceName: 'Client', x: 0, y: 320 },
  ],
  edges: [
    { id: 'write', source: 'a', target: 'b', verb: 'custom', label: 'stores order' },
    { id: 'call', source: 'c', target: 'a', verb: 'custom', label: 'Send request' },
  ],
};
const pageRect =
  /^<svg[^>]*><rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" fill="([^"]+)"\/>/;

test('normalizeBackground defaults to transparent and canonicalizes hex colours', () => {
  assert.equal(normalizeBackground(), 'transparent');
  assert.equal(normalizeBackground('transparent'), 'transparent');
  assert.equal(normalizeBackground('#F2F3F3'), '#f2f3f3');
  assert.equal(normalizeBackground('#FfF'), '#ffffff');
  for (const bad of ['', 'white', '#12', '#1234567', 'Transparent', 'url(#x)', null, 7])
    assert.throws(() => normalizeBackground(bad), /Invalid background/, String(bad));
});

test('SVG export omits the page rectangle by default and paints a requested colour', () => {
  const transparent = diagramSvg(graph, renderer).svg;
  assert.doesNotMatch(transparent, pageRect);
  assert.doesNotMatch(transparent, /#f7f5ef/);
  const coloured = diagramSvg(graph, renderer, { background: '#F2F3F3' }).svg;
  assert.equal(pageRect.exec(coloured)?.[1], '#f2f3f3');
  const { svg: _a, ...size } = diagramSvg(graph, renderer);
  const { svg: _b, ...colouredSize } = diagramSvg(graph, renderer, { background: '#000' });
  assert.deepEqual(colouredSize, size);
  assert.throws(() => diagramSvg(graph, renderer, { background: '"/><script>' }), /Invalid/);
});

test('exports cut connector lines under labels with a mask instead of a page-colour halo', () => {
  const { svg } = diagramSvg(graph, renderer, { markerId: 'x' });
  const mask = /<mask id="x-label-knockout"[\s\S]*?<\/mask>/.exec(svg)?.[0];
  assert.ok(mask, 'mask present');
  assert.match(mask, /stores order/);
  assert.match(mask, /Send request/);
  assert.equal((mask.match(/<rect transform=/g) || []).length, 2);
  const lines = svg.match(/<path class="edge-line"[^>]*>/g);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.includes('mask="url(#x-label-knockout)"')));
  assert.doesNotMatch(svg, /paint-order="stroke"/);
});

test('in-app rendering keeps the label halo and adds no knockout mask', () => {
  const markup = renderer.render(structuredClone(graph), { markerId: 'app' });
  assert.match(markup, /paint-order="stroke"/);
  assert.doesNotMatch(markup, /label-knockout/);
});
