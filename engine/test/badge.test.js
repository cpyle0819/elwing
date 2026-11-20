import test from 'node:test';
import assert from 'node:assert/strict';
import {
  badgeClearance,
  badgeLayout,
  badgeTextColor,
  normalizeBadgeColor,
} from '../diagram/badge.js';
import { validateDocument, arrange, compactLayout } from '../diagram/model.js';
import { applyOperations } from '../operations/diagram-operations.js';
import { operationsSchema } from '../operations/operations-schema.js';
import { checkReadability } from '../operations/readability.js';
import { createDiagramRenderer } from '../render/svg-renderer.js';
import { diagramExcalidraw } from '../diagram/excalidraw-export.js';

const doc = (badge) => ({
  version: 1,
  title: 'Badges',
  nodes: [{ id: 'a', service: 'custom', name: 'Card', x: 0, y: 0, badge }],
  edges: [],
});

test('badge colours accept #RGB and #RRGGBB only', () => {
  assert.equal(normalizeBadgeColor('#ABC'), '#aabbcc');
  assert.equal(normalizeBadgeColor('#1D8102'), '#1d8102');
  for (const value of ['red', '#abcd', '1d8102', '#ggg', 7])
    assert.equal(normalizeBadgeColor(value), null);
});

test('badge text is white unless contrast is below 4.5', () => {
  assert.equal(badgeTextColor('#1d8102'), '#ffffff');
  assert.equal(badgeTextColor('#ffd54f'), '#16191f');
});

test('validateDocument enforces label length and normalises colour', () => {
  assert.equal(
    validateDocument(doc({ label: 'New', color: '#abc' }), []).nodes[0].badge.color,
    '#aabbcc',
  );
  for (const badge of [
    { label: '' },
    { label: 'x'.repeat(13) },
    { label: 'New', color: 'green' },
    { label: 'New', tone: 'new' },
  ])
    assert.throws(() => validateDocument(doc(badge), []), /Invalid badge/);
});

test('badges are centred on the card top-right corner point', () => {
  const badge = badgeLayout({ badge: { label: 'new' } }, 164);
  assert.equal(badge.x + badge.width / 2, 164);
  assert.equal(badge.y, -9);
  assert.equal(badgeLayout({ badge: { label: 'Deprecated-1' } }, 164).label.endsWith('…'), true);
  assert.ok(badgeLayout({ badge: { label: 'Deprecated-1' } }, 164).width <= 82);
});

const cards = (...nodes) => ({ version: 1, title: 'Badges', nodes, edges: [] });
const card = (id, x, extra = {}) => ({ id, service: 'custom', name: id, x, y: 0, ...extra });

test('groups reject badges with a clear error', () => {
  const graph = cards(
    { id: 'g', service: 'group', name: 'Group', x: 0, y: 0, badge: { label: 'NEW' } },
    card('a', 0, { groupId: 'g' }),
  );
  assert.throws(() => validateDocument(graph, []), /not groups/);
});

test('upsert_node sets, keeps and clears a badge', () => {
  let graph = applyOperations(
    cards(card('a', 0)),
    [{ op: 'upsert_node', id: 'a', badge: { label: 'NEW', color: '#F00' } }],
    [],
  );
  assert.deepEqual(graph.nodes[0].badge, { label: 'NEW', color: '#ff0000' });
  graph = applyOperations(graph, [{ op: 'upsert_node', id: 'a', name: 'Renamed' }], []);
  assert.deepEqual(graph.nodes[0].badge, { label: 'NEW', color: '#ff0000' });
  graph = applyOperations(graph, [{ op: 'upsert_node', id: 'a', badge: null }], []);
  assert.equal('badge' in graph.nodes[0], false);
  assert.throws(
    () =>
      applyOperations(
        graph,
        [{ op: 'upsert_node', id: 'a', badge: { label: 'x'.repeat(13) } }],
        [],
      ),
    /badge label/,
  );
});

test('the upsert_node schema accepts badge objects or null', () => {
  const upsert = operationsSchema.items.oneOf.find((v) => v.properties.op.const === 'upsert_node');
  const [shape, empty] = upsert.properties.badge.anyOf;
  assert.deepEqual(shape.required, ['label']);
  assert.equal(shape.additionalProperties, false);
  assert.equal(shape.properties.label.maxLength, 12);
  assert.ok(new RegExp(shape.properties.color.pattern).test('#1d8'));
  assert.ok(!new RegExp(shape.properties.color.pattern).test('green'));
  assert.deepEqual(empty, { type: 'null' });
});

const renderer = createDiagramRenderer({ serviceLabel: (node) => node.service });

test('SVG badges paint after every card and widen the export bounds', () => {
  const plain = cards(card('a', 0), card('b', 176));
  const badged = cards(card('a', 0, { badge: { label: 'NEW' } }), card('b', 176));
  const svg = renderer.render(badged, { exporting: true });
  assert.ok(svg.lastIndexOf('data-node="b"') < svg.indexOf('class="resource-badge"'));
  assert.equal(renderer.render(plain).includes('resource-badge'), false);
  const badge = badgeLayout(badged.nodes[0], 164);
  const box = renderer.bounds(structuredClone(badged));
  assert.equal(box.minY, Math.min(renderer.bounds(structuredClone(plain)).minY, badge.y));
});

test('Excalidraw badges follow every card and stay grouped with theirs', () => {
  const graph = cards(card('a', 0, { badge: { label: 'NEW' } }), card('b', 240));
  const { elements } = JSON.parse(diagramExcalidraw(graph, renderer).text);
  const pill = elements.findIndex((element) => element.id.endsWith(':badge'));
  const label = elements[pill + 1];
  const lastCard = elements.findLastIndex(
    (element) => element.type === 'rectangle' && !element.id.includes(':badge'),
  );
  assert.ok(pill > lastCard);
  assert.equal(elements[pill].backgroundColor, '#1d8102');
  assert.equal(label.strokeColor, '#ffffff');
  assert.equal(label.containerId, elements[pill].id);
  const cardElement = elements.find(
    (element) => element.id === elements[pill].id.replace(':badge', ''),
  );
  assert.deepEqual(elements[pill].groupIds, cardElement.groupIds);
});

test('layouts leave room for badges and keep unbadged spacing', () => {
  const nodes = () => [card('a', 0), card('b', 0), card('c', 0)];
  const plain = cards(...nodes());
  const badged = cards(...nodes().map((node) => ({ ...node, badge: { label: 'Deprecated12' } })));
  const columns = (graph) => [...new Set(graph.nodes.map((node) => node.x))].sort((a, b) => a - b);
  const narrow = compactLayout(plain, 3),
    wide = compactLayout(badged, 3);
  assert.equal(columns(narrow)[1] - columns(narrow)[0], 164 + 56);
  const gap = columns(wide)[1] - columns(wide)[0] - 164;
  assert.ok(gap >= badgeClearance(badged.nodes[0], 164) && gap >= 56);
  const layered = cards(card('a', 0, { badge: { label: 'Deprecated12' } }), card('b', 0));
  layered.edges.push({ id: 'e', source: 'a', target: 'b', verb: 'custom', label: 'x' });
  arrange(layered);
  const [a, b] = layered.nodes;
  assert.ok(b.x - (a.x + 164) >= badgeClearance(a, 164));
});

test('readability warns when a neighbour crowds a badge', () => {
  const crowded = checkReadability(
    cards(card('a', 0, { badge: { label: 'NEW' } }), card('b', 176)),
  ).findings.filter((finding) => finding.code === 'crowded_badge');
  assert.deepEqual(
    crowded.map((finding) => finding.ids),
    [['a', 'b']],
  );
  const clear = checkReadability(
    cards(
      card('a', 0, { badge: { label: 'NEW' } }),
      card('b', 164 + badgeClearance({ badge: { label: 'NEW' } }, 164)),
    ),
  ).findings.filter((finding) => finding.code === 'crowded_badge');
  assert.deepEqual(clear, []);
});
