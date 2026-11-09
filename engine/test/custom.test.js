import test from 'node:test';
import assert from 'node:assert/strict';
import {
  starter,
  addRelationship,
  updateRelationship,
  validateDocument,
} from '../diagram/model.js';
import { routeGraph } from '../diagram/routing.js';
const services = ['cloudfront', 'apigateway', 'lambda', 'dynamodb', 's3', 'sqs'];

// Custom edges allow undocumented pairs and distinct descriptions while preserving identity and atomic validation.
test('custom connections validate labels and preserve documented relationships', () => {
  const doc = starter();
  addRelationship(doc, 'fn', 'custom', 'api', 'custom1', '  Returns status  ');
  addRelationship(doc, 'fn', 'custom', 'api', 'custom2', 'Reports failures');
  assert.equal(doc.edges.at(-2).label, 'Returns status');
  const before = structuredClone(doc);
  for (const label of ['', '   ', 'x'.repeat(241)])
    assert.throws(() => updateRelationship(doc, 'custom1', 'fn', 'custom', 'api', label));
  assert.throws(() => updateRelationship(doc, 'custom2', 'fn', 'custom', 'api', 'Returns status'));
  assert.deepEqual(doc, before);
  updateRelationship(doc, 'e2', 'api', 'custom', 'fn', 'Orders < payload >');
  assert.equal(doc.edges.find((e) => e.id === 'e2').label, 'Orders < payload >');
  updateRelationship(doc, 'e2', 'api', 'invokes', 'fn');
  assert.equal(doc.edges.find((e) => e.id === 'e2').label, undefined);
});

// Custom resource text and edge labels survive JSON round trips without accepting malformed fields.
test('custom documents round trip and reject invalid text', () => {
  const doc = starter();
  doc.nodes.push({
    id: 'box',
    service: 'custom',
    resourceName: 'External system',
    name: 'Manual review and approval',
    x: 0,
    y: 500,
  });
  addRelationship(doc, 'box', 'custom', 'fn', 'box-edge', 'Approves order');
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc)), services), doc);
  for (const change of [
    (d) => (d.nodes.at(-1).resourceName = 7),
    (d) => (d.nodes.at(-1).name = 'x'.repeat(1001)),
    (d) => (d.edges.at(-1).label = {}),
    (d) => (d.edges.at(-1).label = ' '),
  ]) {
    const invalid = structuredClone(doc);
    change(invalid);
    assert.throws(() => validateDocument(invalid, services));
  }
});

// A label override changes text placement without changing connector paths or ports.
test('custom label leaves routed geometry intact', () => {
  const graph = {
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 400, y: 0 },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b', verb: 'invokes' }],
  };
  const original = routeGraph(graph).get('e');
  graph.edges[0] = { ...graph.edges[0], verb: 'custom', label: 'Request with order ID' };
  const custom = routeGraph(graph).get('e');
  assert.deepEqual(custom.points, original.points);
  assert.equal(custom.labelText, 'Request with order ID');
});
