import test from 'node:test';
import assert from 'node:assert/strict';
import {
  starter,
  addRelationship,
  updateRelationship,
  removeNode,
  validateDocument,
  arrange,
  route,
  compactLayout,
} from '../diagram/model.js';
const services = ['cloudfront', 'apigateway', 'lambda', 'dynamodb', 's3', 'sqs'];

// Import reports field errors in order and resolves groups after validating all resource fields.
test('import validation preserves error precedence and forward group references', () => {
  const doc = {
    version: 1,
    title: '',
    nodes: [
      { id: 'resource', service: 'custom', name: 'Label', x: 0, y: 0, groupId: 'group' },
      { id: 'group', service: 'group', name: 'Group', x: 0, y: 0 },
    ],
    edges: [],
  };
  assert.deepEqual(validateDocument(doc, []), doc);
  doc.nodes[0].resourceType = 'unknown-type';
  doc.nodes[0].icon = 'invalid-icon';
  doc.nodes[0].x = Infinity;
  assert.throws(() => validateDocument(doc, []), {
    message: 'Invalid resource type for this service.',
  });
  delete doc.nodes[0].resourceType;
  assert.throws(() => validateDocument(doc, []), {
    message: 'Invalid custom icon. Upload an image through the resource panel.',
  });
  delete doc.nodes[0].icon;
  doc.nodes[0].groupId = 'missing-group';
  assert.throws(() => validateDocument(doc, []), { message: 'Invalid resource in diagram.' });
  doc.nodes[0].x = 0;
  assert.throws(() => validateDocument(doc, []), {
    message: 'A resource must belong to an existing group. Nested groups are not supported.',
  });
});
// The connection limit rejects additions without mutation while existing connections remain editable.
test('relationship additions cannot exceed the document limit', () => {
  const doc = starter();
  doc.edges = Array.from({ length: 1000 }, (_, i) => ({
    id: `e${i}`,
    source: 'fn',
    target: 'queue',
    verb: 'custom',
    label: `operation ${i}`,
  }));
  validateDocument(doc, services);
  const before = structuredClone(doc);
  assert.throws(
    () => addRelationship(doc, 'fn', 'custom', 'queue', 'overflow', 'another operation'),
    /1,000 relationships/,
  );
  assert.deepEqual(doc, before);
  updateRelationship(doc, 'e0', 'fn', 'custom', 'queue', 'renamed operation');
  validateDocument(doc, services);
  doc.edges.pop();
  addRelationship(doc, 'fn', 'custom', 'queue', 'replacement', 'replacement operation');
  validateDocument(doc, services);
});
// A chosen relationship preserves source, meaning, and arrow destination.
test('creates a directed relationship and rejects duplicates and self links', () => {
  const doc = starter();
  addRelationship(doc, 'fn', 'reads from', 'assets', 'new');
  assert.deepEqual(doc.edges.at(-1), {
    id: 'new',
    source: 'fn',
    verb: 'reads from',
    target: 'assets',
  });
  assert.throws(() => addRelationship(doc, 'fn', 'reads from', 'assets', 'duplicate'));
  assert.throws(() => addRelationship(doc, 'fn', 'invokes', 'fn', 'self'));
  assert.throws(() => addRelationship(doc, 'missing', 'invokes', 'fn', 'bad'));
});
// Deleting a resource removes its incoming and outgoing connections.
test('resource removal leaves no dangling arrows', () => {
  const doc = starter();
  removeNode(doc, 'fn');
  assert.equal(doc.nodes.length, 5);
  assert.ok(doc.edges.every((e) => e.source !== 'fn' && e.target !== 'fn'));
  validateDocument(doc, services);
});
// Import rejects malformed graphs while preserving valid exported documents.
test('validates imported diagrams', () => {
  const doc = starter();
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc)), services), doc);
  doc.edges[0].target = 'unknown';
  assert.throws(() => validateDocument(doc, services));
  const duplicate = starter();
  duplicate.nodes.push({ ...duplicate.nodes[0] });
  assert.throws(() => validateDocument(duplicate, services));
  const invalid = starter();
  invalid.nodes[0].x = Infinity;
  assert.throws(() => validateDocument(invalid, services));
});
// Arrangement terminates for cycles and gives each resource a distinct position.
test('arranges cycles and disconnected resources', () => {
  const doc = starter();
  doc.edges.push({ id: 'cycle', source: 'db', verb: 'connects to', target: 'cdn' });
  doc.nodes.push({ id: 'isolated', name: 'Isolated', service: 's3', x: 0, y: 0 });
  arrange(doc);
  assert.equal(new Set(doc.nodes.map((n) => `${n.x},${n.y}`)).size, doc.nodes.length);
  assert.ok(doc.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});
// Automatic arrows attach to card boundaries and update after a resource moves.
test('routes horizontal and vertical connections', () => {
  const a = { x: 0, y: 0 },
    b = { x: 300, y: 0 };
  assert.match(route(a, b).d, /^M 164 48 .* 300 48$/);
  b.x = 0;
  b.y = 300;
  assert.match(route(a, b).d, /^M 82 96 .* 82 300$/);
  assert.notEqual(route(a, b, 12).d, route(a, b).d);
});
// Editing keeps a connection's identity and rejects invalid changes without mutating the graph.
test('updates relationships atomically', async () => {
  const { updateRelationship } = await import('../diagram/model.js');
  const doc = starter();
  updateRelationship(doc, 'e2', 'api', 'reads from', 'assets');
  assert.deepEqual(doc.edges[1], { id: 'e2', source: 'api', target: 'assets', verb: 'reads from' });
  assert.equal(doc.edges.length, 5);
  const before = structuredClone(doc);
  assert.throws(() => updateRelationship(doc, 'e2', 'cdn', 'forwards to', 'api'));
  assert.throws(() => updateRelationship(doc, 'e2', 'api', 'invokes', 'api'));
  assert.throws(() => updateRelationship(doc, 'e2', 'missing', 'invokes', 'fn'));
  assert.throws(() => updateRelationship(doc, 'missing', 'api', 'invokes', 'fn'));
  assert.deepEqual(doc, before);
  updateRelationship(doc, 'e2', 'api', 'reads from', 'assets');
  assert.deepEqual(doc, before);
});

// Responsive layout is a copy with bounded columns, distinct positions, and unchanged graph identities.
test('compact layout preserves the saved graph and relationships', () => {
  const graph = starter(),
    before = structuredClone(graph);
  for (const columns of [1, 2]) {
    const compact = compactLayout(graph, columns);
    assert.deepEqual(graph, before);
    assert.deepEqual(compact.edges, graph.edges);
    assert.ok(new Set(compact.nodes.map((n) => n.x)).size <= columns);
    assert.equal(new Set(compact.nodes.map((n) => `${n.x},${n.y}`)).size, graph.nodes.length);
  }
});

// Reusing icon bytes does not bypass service restrictions or validation of a later changed icon.
test('shared custom icons retain validation and independent document copies', () => {
  const icon = 'data:image/png;base64,iVBORw0KGgoAAA==';
  const doc = {
    version: 1,
    title: 'Shared icons',
    edges: [],
    nodes: [
      { id: 'a', service: 'custom', name: 'A', icon, x: 0, y: 0 },
      { id: 'b', service: 'custom', name: 'B', icon, x: 200, y: 0 },
    ],
  };
  const validated = validateDocument(doc, services);
  validated.nodes[0].name = 'Edited';
  assert.equal(doc.nodes[0].name, 'A');
  doc.nodes[1].service = 'lambda';
  assert.throws(() => validateDocument(doc, services), /Invalid custom icon/);
  doc.nodes[1].service = 'custom';
  doc.nodes[1].icon = icon + '<script>';
  assert.throws(() => validateDocument(doc, services), /Invalid custom icon/);
});

// Side overrides survive imports and label edits; invalid edits cannot alter the original edge.
test('custom connection sides validate and persist', () => {
  const doc = starter();
  addRelationship(doc, 'fn', 'custom', 'db', 'side', 'data', {
    sourceSide: 'bottom',
    targetSide: 'top',
  });
  updateRelationship(doc, 'side', 'fn', 'custom', 'db', 'customer data');
  const edge = doc.edges.find((e) => e.id === 'side');
  assert.equal(edge.sourceSide, 'bottom');
  assert.equal(edge.targetSide, 'top');
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc)), services), doc);
  for (const sides of [null, 'read', { targetSide: 'diagonal' }, { sourceSide: ['top'] }]) {
    const before = structuredClone(doc);
    assert.throws(
      () => updateRelationship(doc, 'side', 'fn', 'custom', 'db', 'invalid', sides),
      /connection side/,
    );
    assert.deepEqual(doc, before);
  }
  for (const value of [null, 'diagonal', ['top']]) {
    const invalid = structuredClone(doc);
    invalid.edges.find((e) => e.id === 'side').sourceSide = value;
    assert.throws(() => validateDocument(invalid, services), /Invalid relationship/);
  }
  updateRelationship(doc, 'side', 'fn', 'custom', 'db', 'customer data', {
    sourceSide: 'auto',
    targetSide: 'auto',
  });
  assert.equal(edge.sourceSide, undefined);
  assert.equal(edge.targetSide, undefined);
  assert.throws(
    () => addRelationship(doc, 'fn', 'custom', 'db', 'duplicate', 'customer data'),
    /already exists/,
  );
  doc.edges = doc.edges.filter((e) => e.id !== 'e3');
  updateRelationship(doc, 'side', 'fn', 'writes to', 'db');
  assert.equal(edge.sourceSide, undefined);
  assert.equal(edge.targetSide, undefined);
});

// Existing typed custom edges preserve their Auto behavior while new edges need no semantic type.
test('saved custom connection types remain readable', () => {
  const doc = starter();
  const edge = {
    id: 'legacy',
    source: 'fn',
    target: 'db',
    verb: 'custom',
    label: 'reads data',
    connectionType: 'read',
  };
  doc.edges.push(edge);
  updateRelationship(doc, 'legacy', 'fn', 'custom', 'db', 'reads records', {
    sourceSide: 'auto',
    targetSide: 'auto',
  });
  assert.equal(edge.connectionType, 'read');
  assert.deepEqual(validateDocument(doc, services), doc);
  addRelationship(doc, 'fn', 'custom', 'db', 'new', 'stores records');
  assert.equal(doc.edges.at(-1).connectionType, undefined);
});

// Side changes discard bends aimed at the old port; label-only edits retain manual geometry.
test('relationship edits reset manual routing only when attachments change', () => {
  const doc = starter();
  const edge = doc.edges.find((edge) => edge.source === 'fn' && edge.target === 'db');
  edge.verb = 'reads from';
  const waypoints = [
    { x: 800, y: 80 },
    { x: 950, y: 80 },
  ];
  edge.waypoints = structuredClone(waypoints);
  updateRelationship(doc, edge.id, edge.source, 'custom', edge.target, 'reads data', {
    sourceSide: 'right',
    targetSide: 'top',
  });
  assert.deepEqual(edge.waypoints, waypoints);
  updateRelationship(doc, edge.id, edge.source, 'custom', edge.target, 'reads data', {
    sourceSide: 'right',
    targetSide: 'left',
  });
  assert.equal(edge.waypoints, undefined);
});

// Imported overrides accept only six-digit hex colors, preventing unsafe SVG style interpolation.
test('connector colors validate on import', () => {
  const doc = starter();
  doc.edges[0].color = '#aB1234';
  assert.equal(validateDocument(doc, services).edges[0].color, '#aB1234');
  for (const color of ['red', '#123', '#123456;stroke:red', {}, null]) {
    doc.edges[0].color = color;
    assert.throws(() => validateDocument(doc, services), /Invalid relationship/);
  }
});
