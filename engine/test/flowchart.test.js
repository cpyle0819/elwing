import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDocument,
  arrange,
  addRelationship,
  updateRelationship,
} from '../diagram/model.js';
import {
  FLOWCHART_SHAPES,
  clipToOutline,
  flowPath,
  flowSides,
  flowTextWidth,
} from '../diagram/flowchart.js';
import { resourceWidth, resourceHeight, flowTextLines } from '../diagram/resource-sizing.js';
import { nodeWidth, nodeHeight } from '../diagram/groups.js';
import { applyOperations } from '../operations/diagram-operations.js';
import { operationsSchema } from '../operations/operations-schema.js';
import { checkReadability } from '../operations/readability.js';
import { createDiagramRenderer } from '../render/svg-renderer.js';
import { diagramExcalidraw } from '../diagram/excalidraw-export.js';
import { catalogGraph } from '../catalog/catalog-graph.js';

const shape = (id, kind, name) => ({ id, service: 'flowchart', shape: kind, name, x: 0, y: 0 });
const flow = (id, source, target, label) => ({
  id,
  source,
  target,
  verb: 'flow',
  ...(label === undefined ? {} : { label }),
});
const orderChart = () => ({
  version: 1,
  title: 'Order process',
  nodes: [
    shape('start', 'start-end', 'Order placed'),
    shape('charge', 'process', 'Charge card'),
    shape('ok', 'decision', 'Payment OK?'),
    shape('ship', 'process', 'Ship order'),
    shape('retry', 'process', 'Ask for another card'),
    shape('end', 'start-end', 'End'),
  ],
  edges: [
    flow('f1', 'start', 'charge'),
    flow('f2', 'charge', 'ok'),
    flow('f3', 'ok', 'ship', 'Yes'),
    flow('f4', 'ok', 'retry', 'No'),
    flow('f5', 'retry', 'charge'),
    flow('f6', 'ship', 'end'),
  ],
});
const renderer = createDiagramRenderer({ serviceLabel: (node) => node.service });
const byId = (doc) => new Map(doc.nodes.map((node) => [node.id, node]));
const centreX = (node) => node.x + nodeWidth(node) / 2;

test('every flowchart shape validates and unknown shapes are rejected', () => {
  assert.deepEqual(FLOWCHART_SHAPES, [
    'start-end',
    'process',
    'decision',
    'input-output',
    'document',
    'subprocess',
  ]);
  for (const kind of FLOWCHART_SHAPES)
    validateDocument({ version: 1, title: 'S', nodes: [shape('a', kind, 'Step')], edges: [] }, []);
  const invalid = (node) => () =>
    validateDocument({ version: 1, title: 'S', nodes: [node], edges: [] }, ['lambda']);
  assert.throws(invalid(shape('a', 'connector', 'A')), /Invalid flowchart shape/);
  assert.throws(invalid({ ...shape('a', 'process', 'A'), shape: undefined }), /flowchart shape/);
  assert.throws(invalid({ ...shape('a', 'process', 'A'), resourceName: 'H' }), /Invalid resource/);
  assert.throws(
    invalid({ id: 'a', service: 'lambda', shape: 'process', name: 'A', x: 0, y: 0 }),
    /Only flowchart nodes/,
  );
  assert.throws(
    () =>
      validateDocument(
        {
          version: 1,
          title: 'S',
          nodes: [
            { id: 'g', service: 'group', name: 'Lane', x: 0, y: 0 },
            { ...shape('a', 'process', 'A'), groupId: 'g' },
          ],
          edges: [],
        },
        [],
      ),
    /cannot join groups/,
  );
});

test('flow arrows have optional labels and must touch a flowchart shape', () => {
  const doc = {
    version: 1,
    title: 'Mixed',
    nodes: [
      shape('a', 'process', 'Resize photo'),
      shape('b', 'decision', 'Too big?'),
      { id: 'fn', service: 'lambda', name: 'Resizer', x: 0, y: 0 },
      { id: 'db', service: 'dynamodb', name: 'Photos', x: 0, y: 0 },
    ],
    edges: [],
  };
  addRelationship(doc, 'a', 'flow', 'b', 'plain');
  addRelationship(doc, 'b', 'flow', 'fn', 'yes', ' Yes ');
  assert.deepEqual(doc.edges[0], { id: 'plain', source: 'a', verb: 'flow', target: 'b' });
  assert.equal(doc.edges[1].label, 'Yes');
  assert.throws(() => addRelationship(doc, 'fn', 'flow', 'db', 'x'), /must start or end/);
  assert.throws(() => addRelationship(doc, 'a', 'custom', 'fn', 'x', 'runs'), /“flow” verb/);
  assert.throws(() => addRelationship(doc, 'a', 'invokes', 'fn', 'x'), /“flow” verb/);
  assert.throws(() => addRelationship(doc, 'a', 'flow', 'b', 'x', '   '), /flow label/);
  // AWS-to-AWS edges keep the catalog rules.
  addRelationship(doc, 'fn', 'writes to', 'db', 'save');
  // Updates keep or drop the optional label.
  updateRelationship(doc, 'yes', 'b', 'flow', 'fn', undefined);
  assert.equal(doc.edges[1].label, undefined);
  updateRelationship(doc, 'plain', 'a', 'flow', 'b', 'Next');
  assert.equal(doc.edges[0].label, 'Next');
  validateDocument(doc, ['lambda', 'dynamodb']);
  // Imports enforce the same pairing rules.
  const imported = (edge) => () =>
    validateDocument({ ...doc, edges: [edge] }, ['lambda', 'dynamodb']);
  assert.throws(imported(flow('x', 'fn', 'db')), /Invalid relationship/);
  assert.throws(
    imported({ id: 'x', source: 'a', target: 'b', verb: 'custom', label: 'next' }),
    /Invalid relationship/,
  );
  imported(flow('x', 'a', 'b', 'Yes'))();
});

test('operations create shapes, arrange in a chosen direction and drop shape on service change', () => {
  const variants = operationsSchema.items.oneOf;
  const upsert = variants.find((v) => v.properties.op.const === 'upsert_node');
  assert.deepEqual(upsert.properties.shape.enum, FLOWCHART_SHAPES);
  const arrangeOp = variants.find((v) => v.properties.op.const === 'arrange');
  assert.deepEqual(arrangeOp.properties.direction.enum, ['down', 'right']);
  assert.deepEqual(arrangeOp.required, ['op']);
  const empty = { version: 1, title: 'Ops', nodes: [], edges: [] };
  const made = applyOperations(
    empty,
    [
      { op: 'upsert_node', id: 'a', service: 'flowchart', shape: 'start-end', name: 'Start' },
      { op: 'upsert_node', id: 'b', service: 'flowchart', shape: 'process', name: 'Work' },
      { op: 'upsert_edge', id: 'e', source: 'a', target: 'b', verb: 'flow' },
      { op: 'arrange', direction: 'right' },
    ],
    ['lambda'],
  );
  const [a, b] = made.nodes;
  assert.ok(b.x > a.x, 'left to right when asked');
  const down = applyOperations(made, [{ op: 'arrange' }], ['lambda']);
  assert.ok(down.nodes[1].y > down.nodes[0].y, 'pure flow charts default to top to bottom');
  assert.equal(down.nodes[0].x + nodeWidth(down.nodes[0]) / 2, centreX(down.nodes[1]));
  assert.throws(
    () => applyOperations(made, [{ op: 'upsert_node', id: 'c', service: 'flowchart' }], ['lambda']),
    /Invalid flowchart shape/,
  );
  const switched = applyOperations(
    { ...made, edges: [] },
    [{ op: 'upsert_node', id: 'a', service: 'lambda' }],
    ['lambda'],
  );
  assert.equal(switched.nodes[0].shape, undefined);
});

test('top-to-bottom arrange keeps Yes straight down, No to the right and loop-backs above', () => {
  const doc = orderChart();
  arrange(doc);
  const n = byId(doc);
  const spine = ['start', 'charge', 'ok', 'ship', 'end'];
  for (const [upper, lower] of spine.slice(1).map((id, i) => [spine[i], id])) {
    assert.ok(n.get(lower).y >= n.get(upper).y + nodeHeight(n.get(upper)), `${lower} below`);
    assert.equal(centreX(n.get(lower)), centreX(n.get('start')), `${lower} on the spine`);
  }
  const no = n.get('retry'),
    ok = n.get('ok');
  assert.ok(no.x >= ok.x + nodeWidth(ok), 'No branch sits right of the decision');
  assert.equal(no.y + nodeHeight(no) / 2, ok.y + nodeHeight(ok) / 2);
  // Mixed diagrams keep left-to-right arrange.
  const mixed = orderChart();
  mixed.nodes.push({ id: 'fn', service: 'lambda', name: 'Charger', x: 0, y: 0 });
  mixed.edges.push(flow('f7', 'charge', 'fn'));
  arrange(mixed);
  const m = byId(mixed);
  assert.ok(m.get('charge').x > m.get('start').x);
});

test('shapes size within card limits and text fits the outline', () => {
  const long = shape(
    'd',
    'decision',
    'Is the customer eligible for the premium returns programme?',
  );
  assert.equal(resourceWidth(shape('a', 'process', 'A')), 180);
  assert.equal(resourceWidth(shape('a', 'input-output', 'A')), 196);
  assert.equal(resourceHeight(shape('a', 'decision', 'Ok?')), 120);
  assert.equal(resourceHeight(shape('a', 'process', 'A')), 96);
  assert.ok(resourceHeight(long) > 120 && resourceHeight(long) <= 800);
  assert.equal(resourceHeight({ ...long, height: 300 }), 300);
});

test('route endpoints land on the drawn outline', () => {
  const diamond = { ...shape('d', 'decision', 'Q?'), x: 100, y: 100 };
  // Centre of the top side is the diamond's top vertex.
  assert.deepEqual(clipToOutline(diamond, 180, 120, { x: 190, y: 100 }, 'top'), { x: 190, y: 100 });
  // Off-centre on the top side moves down onto the slanted edge.
  const off = clipToOutline(diamond, 180, 120, { x: 202, y: 100 }, 'top');
  assert.equal(off.x, 202);
  assert.ok(Math.abs(off.y - (100 + (60 * 12) / 90)) < 1e-9);
  const pill = { ...shape('p', 'start-end', 'Go'), x: 0, y: 0 };
  assert.deepEqual(clipToOutline(pill, 180, 96, { x: 0, y: 48 }, 'left'), { x: 0, y: 48 });
  const io = { ...shape('i', 'input-output', 'Data'), x: 0, y: 0 };
  assert.equal(clipToOutline(io, 196, 96, { x: 0, y: 48 }, 'left').x, 10);
  for (const kind of FLOWCHART_SHAPES) assert.match(flowPath(kind, 180, 96), /^M .* Z$/);
  const doc = orderChart();
  arrange(doc);
  const routes = renderer.routes(doc);
  const n = byId(doc);
  const yes = routes.get('f3').points;
  const decision = n.get('ok');
  assert.deepEqual(yes[0], { x: centreX(decision), y: decision.y + nodeHeight(decision) });
  const no = routes.get('f4').points[0];
  assert.deepEqual(no, {
    x: decision.x + nodeWidth(decision),
    y: decision.y + nodeHeight(decision) / 2,
  });
});

test('SVG draws shapes, horizontal flow labels and correctly oriented arrowheads', () => {
  const doc = orderChart();
  doc.nodes[1].badge = { label: 'NEW' };
  arrange(doc);
  const svg = renderer.render(doc, { exporting: true });
  for (const kind of ['start-end', 'process', 'decision'])
    assert.match(svg, new RegExp(`data-shape="${kind}"`));
  assert.match(svg, /fill="#fff4e0"/);
  assert.match(svg, /fill="#e9f5e6"/);
  assert.match(svg, />Yes</);
  assert.match(svg, />No</);
  assert.equal(svg.match(/class="connector-label"/g).length, 2, 'unlabelled flows show no text');
  assert.doesNotMatch(svg, /rotate\(-90/);
  assert.match(svg, /orient="auto"/);
  assert.doesNotMatch(svg, /auto-start-reverse/);
  assert.match(svg, /class="resource-badge" data-node="charge"/);
  const routes = renderer.routes(doc);
  for (const id of ['f3', 'f4']) assert.equal(routes.get(id).labelAngle, 0);
});

test('Excalidraw keeps text and arrows bound to every shape', () => {
  const doc = {
    version: 1,
    title: 'All shapes',
    nodes: FLOWCHART_SHAPES.map((kind, i) => shape(`s${i}`, kind, kind)),
    edges: FLOWCHART_SHAPES.slice(1).map((_, i) =>
      flow(`f${i}`, `s${i}`, `s${i + 1}`, i ? undefined : 'Yes'),
    ),
  };
  arrange(doc);
  const { elements } = JSON.parse(diagramExcalidraw(doc, renderer).text);
  const find = (id) => elements.find((element) => element.id === id);
  const cards = elements.filter(
    (e) => e.boundElements?.some((b) => b.type === 'text') && e.type !== 'arrow',
  );
  assert.ok(elements.some((e) => e.type === 'diamond'));
  assert.equal(elements.filter((e) => e.type === 'line' && e.id.endsWith(':outline')).length, 3);
  assert.equal(cards.length, FLOWCHART_SHAPES.length);
  for (const card of cards) {
    const textId = card.boundElements.find((b) => b.type === 'text').id;
    assert.equal(find(textId).containerId, card.id);
  }
  for (const arrow of elements.filter((e) => e.type === 'arrow')) {
    assert.ok(cards.some((card) => card.id === arrow.startBinding.elementId));
    assert.ok(cards.some((card) => card.id === arrow.endBinding.elementId));
  }
});

test('readability flags flow chart structure and allows repeated step names', () => {
  const doc = orderChart();
  doc.nodes.push(shape('end2', 'start-end', 'End'), shape('lonely', 'decision', 'Again?'));
  doc.edges.push(
    flow('f7', 'retry', 'end2'),
    flow('f8', 'end2', 'lonely'),
    flow('f9', 'lonely', 'end'),
  );
  delete doc.edges[3].label;
  arrange(doc);
  const codes = checkReadability(doc).findings.map((f) => `${f.code}:${f.ids.join(',')}`);
  assert.ok(codes.includes('unlabelled_decision_branch:f4'));
  assert.ok(codes.includes('decision_without_branches:lonely'));
  assert.ok(codes.includes('start_end_in_middle:end2'));
  assert.ok(!codes.some((code) => code.startsWith('duplicate_name')));
  assert.ok(!codes.includes('start_end_in_middle:start'));
});

test('catalog describes the flowchart primitive with a valid example', () => {
  const { flowchart, flowExample } = catalogGraph().diagramPrimitives;
  assert.deepEqual(flowchart.shapes, FLOWCHART_SHAPES);
  validateDocument({ version: 1, title: 'Example', ...flowExample }, ['lambda']);
});

test('Excalidraw exports a shape with an empty name without a text label', () => {
  const doc = { version: 1, title: 'Blank', nodes: [shape('s0', 'process', '')], edges: [] };
  arrange(doc);
  const { elements } = JSON.parse(diagramExcalidraw(doc, renderer).text);
  const card = elements.find((e) => e.type === 'rectangle');
  assert.ok(card);
  assert.ok(!card.boundElements.some((b) => b.type === 'text'));
});

test('start-end text width stays positive for tall narrow outlines', () => {
  const node = { ...shape('s0', 'start-end', 'Start'), width: 164, height: 800 };
  assert.equal(flowTextWidth(node, 164, 800), 24);
});

test('a No branch moves right as a whole, not just its first step', () => {
  const doc = {
    version: 1,
    title: 'Branch',
    nodes: [
      shape('start', 'start-end', 'Start'),
      shape('ask', 'decision', 'In stock?'),
      shape('ship', 'process', 'Ship'),
      shape('order', 'process', 'Order more'),
      shape('wait', 'process', 'Wait for delivery'),
      shape('end', 'start-end', 'End'),
    ],
    edges: [
      flow('f1', 'start', 'ask'),
      flow('f2', 'ask', 'ship', 'Yes'),
      flow('f3', 'ask', 'order', 'No'),
      flow('f4', 'order', 'wait'),
      flow('f5', 'ship', 'end'),
    ],
  };
  arrange(doc);
  const n = byId(doc);
  const ask = n.get('ask'),
    order = n.get('order'),
    wait = n.get('wait');
  assert.ok(order.x >= ask.x + nodeWidth(ask), 'No head right of the decision');
  assert.equal(centreX(wait), centreX(order), 'branch step stays under its head');
  assert.ok(wait.y >= order.y + nodeHeight(order), 'branch step below its head');
  assert.ok(wait.x >= ask.x + nodeWidth(ask), 'branch step clear of the spine');
});

test('text in a manually sized shape is clamped to the outline with an ellipsis', () => {
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
  const node = { ...shape('s0', 'process', long), width: 164, height: 96 };
  const lines = flowTextLines(node, 164, 96);
  assert.equal(lines.length, 3);
  assert.ok(lines.at(-1).endsWith('…'));
  const doc = { version: 1, title: 'Clamp', nodes: [node], edges: [] };
  const svg = renderer.render(doc, { exporting: true });
  const shapeSvg = svg.slice(svg.indexOf('flowchart-node'));
  assert.equal(shapeSvg.slice(0, shapeSvg.indexOf('</g>')).split('<tspan').length - 1, 3);
  const { elements } = JSON.parse(diagramExcalidraw(doc, renderer).text);
  assert.equal(elements.find((e) => e.type === 'text' && e.containerId).text.split('\n').length, 3);
});

test('a single manual flow side is honoured and the other side stays automatic', () => {
  const a = { x: 0, y: 0 },
    b = { x: 0, y: 200 };
  const auto = flowSides({}, a, b, 160, 80, 160, 80);
  assert.deepEqual(auto, { sourceSide: 'bottom', targetSide: 'top' });
  assert.deepEqual(flowSides({ sourceSide: 'left' }, a, b, 160, 80, 160, 80), {
    sourceSide: 'left',
    targetSide: 'top',
  });
  assert.deepEqual(flowSides({ sourceSide: 'auto', targetSide: 'right' }, a, b, 160, 80, 160, 80), {
    sourceSide: 'bottom',
    targetSide: 'right',
  });
  assert.deepEqual(flowSides({ sourceSide: 'left', targetSide: 'left' }, a, b, 160, 80, 160, 80), {
    sourceSide: 'left',
    targetSide: 'left',
  });
});

test('a step shared by two No branches stays put as a join, below both', () => {
  const doc = {
    version: 1,
    title: 'Shared',
    nodes: [
      shape('start', 'start-end', 'Start'),
      shape('d1', 'decision', 'Valid?'),
      shape('d2', 'decision', 'Paid?'),
      shape('fix', 'process', 'Fix details'),
      shape('pay', 'process', 'Request payment'),
      shape('notify', 'process', 'Notify customer'),
      shape('end', 'start-end', 'End'),
    ],
    edges: [
      flow('f1', 'start', 'd1'),
      flow('f2', 'd1', 'd2', 'Yes'),
      flow('f3', 'd1', 'fix', 'No'),
      flow('f4', 'd2', 'end', 'Yes'),
      flow('f5', 'd2', 'pay', 'No'),
      flow('f6', 'fix', 'notify'),
      flow('f7', 'pay', 'notify'),
    ],
  };
  arrange(doc);
  const n = byId(doc);
  const notify = n.get('notify');
  for (const head of [n.get('fix'), n.get('pay')])
    assert.ok(notify.y >= head.y + nodeHeight(head), `join step below ${head.id}`);
  const nodes = [...n.values()];
  for (const a of nodes)
    for (const b of nodes)
      if (a !== b)
        assert.ok(
          a.x + nodeWidth(a) <= b.x ||
            b.x + nodeWidth(b) <= a.x ||
            a.y + nodeHeight(a) <= b.y ||
            b.y + nodeHeight(b) <= a.y,
          `${a.id} overlaps ${b.id}`,
        );
});

test('a flow arrow cannot connect a shape to a group', () => {
  const doc = {
    version: 1,
    title: 'Group',
    nodes: [
      shape('a', 'process', 'Resize photo'),
      { id: 'g', service: 'group', name: 'Workers', x: 0, y: 0 },
      { id: 'fn', service: 'lambda', name: 'Resizer', x: 0, y: 0 },
    ],
    edges: [],
  };
  assert.throws(() => addRelationship(doc, 'a', 'flow', 'g', 'x'), /cannot connect to group/);
  assert.throws(() => addRelationship(doc, 'g', 'flow', 'a', 'y'), /cannot connect to group/);
  addRelationship(doc, 'a', 'flow', 'fn', 'z');
  assert.equal(doc.edges.length, 1);
});

test('top-to-bottom arrange never overlaps shapes in 200 seeded flow charts with joins', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const overlap = (a, b) =>
    a.x < b.x + nodeWidth(b) &&
    b.x < a.x + nodeWidth(a) &&
    a.y < b.y + nodeHeight(b) &&
    b.y < a.y + nodeHeight(a);
  for (let chart = 0; chart < 200; chart++) {
    const count = 4 + Math.floor(random() * 9);
    const nodes = Array.from({ length: count }, (_, i) =>
      shape(`n${i}`, random() < 0.3 ? 'decision' : 'process', `Step ${i}`),
    );
    const edges = [];
    const capacity = (n) => (n.shape === 'decision' ? 2 : 1);
    const used = (n) => edges.filter((e) => e.source === n.id).length;
    const link = (source, target) => {
      if (used(source) >= capacity(source)) return;
      const label = source.shape === 'decision' ? (used(source) ? 'No' : 'Yes') : undefined;
      edges.push(flow(`e${edges.length}`, source.id, target.id, label));
    };
    for (let i = 1; i < count; i++) {
      const open = nodes.slice(0, i).filter((n) => used(n) < capacity(n));
      if (!open.length) break;
      link(open[Math.floor(random() * open.length)], nodes[i]);
    }
    for (let j = 0; j < 4; j++) {
      const a = Math.floor(random() * count),
        b = a + 1 + Math.floor(random() * (count - a));
      if (b < count) link(nodes[a], nodes[b]);
    }
    const doc = { version: 1, title: `Chart ${chart}`, nodes, edges };
    arrange(doc);
    for (const a of nodes)
      for (const b of nodes)
        assert.ok(a === b || !overlap(a, b), `chart ${chart}: ${a.id} overlaps ${b.id}`);
  }
});
