import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperations } from '../operations/diagram-operations.js';
import { allowedNodeRelationships, relationshipEvidence } from '../catalog/relationship-rules.js';
import { checkReadability, readabilityGuide } from '../operations/readability.js';
import { starter } from '../diagram/model.js';
import { readFileSync } from 'node:fs';

const services = JSON.parse(
  readFileSync(new URL('../catalog/services.json', import.meta.url), 'utf8'),
);
const ids = services.map((service) => service.id);
const blank = { version: 1, title: 'Blank', nodes: [], edges: [] };

// A failed operation rejects the complete batch without altering any part of the input diagram.
test('agent batches roll back all changes when an operation is invalid', () => {
  const original = starter();
  const before = structuredClone(original);
  assert.throws(
    () =>
      applyOperations(
        original,
        [
          { op: 'upsert_node', id: 'fn', name: 'Changed worker' },
          { op: 'upsert_edge', id: 'bad', source: 'fn', target: 'missing', verb: 'invokes' },
        ],
        ids,
      ),
    /source and target/,
  );
  assert.deepEqual(original, before);
});

// A targeted edit preserves unrelated nodes, IDs, manual geometry, icons, and connection details.
test('agent patches preserve unspecified resource and connection fields', () => {
  const original = starter();
  original.nodes[2].width = 250;
  original.nodes[2].height = 180;
  const result = applyOperations(
    original,
    [{ op: 'upsert_node', id: 'fn', name: 'Checkout worker' }],
    ids,
  );
  assert.deepEqual(
    result.nodes.filter((node) => node.id !== 'fn'),
    original.nodes.filter((node) => node.id !== 'fn'),
  );
  assert.deepEqual(result.edges, original.edges);
  assert.deepEqual(
    result.nodes.find((node) => node.id === 'fn'),
    { ...original.nodes[2], name: 'Checkout worker' },
  );
});

// Node type changes revalidate incident edges, while unrelated edits retain existing notation.
test('agent edits revalidate changed edge semantics and preserve untouched existing edges', () => {
  const original = starter();
  original.edges[0].verb = 'writes to';
  assert.doesNotThrow(() =>
    applyOperations(original, [{ op: 'upsert_node', id: 'db', x: 950 }], ids),
  );
  assert.throws(
    () => applyOperations(original, [{ op: 'upsert_node', id: 'fn', service: 'cloudfront' }], ids),
    /not documented/,
  );
  assert.throws(
    () =>
      applyOperations(
        starter(),
        [{ op: 'upsert_edge', id: 'invalid', source: 'db', target: 'cdn', verb: 'invokes' }],
        ids,
      ),
    /not documented/,
  );
});

// Group moves translate members and removing a group preserves those resources and their identities.
test('agent grouping and movement follow editor group semantics', () => {
  const grouped = applyOperations(
    starter(),
    [{ op: 'set_group', id: 'checkout', name: 'Checkout', members: ['fn', 'db'] }],
    ids,
  );
  const group = grouped.nodes.find((node) => node.id === 'checkout');
  const moved = applyOperations(
    grouped,
    [{ op: 'move_group', id: 'checkout', x: group.x + 100, y: group.y + 50 }],
    ids,
  );
  assert.equal(
    moved.nodes.find((node) => node.id === 'fn').x,
    grouped.nodes.find((node) => node.id === 'fn').x + 100,
  );
  const ungrouped = applyOperations(moved, [{ op: 'remove_node', id: 'checkout' }], ids);
  assert.equal(ungrouped.nodes.length, 6);
  assert.equal(ungrouped.nodes.find((node) => node.id === 'fn').groupId, undefined);
  assert.throws(
    () =>
      applyOperations(
        grouped,
        [{ op: 'set_group', id: 'nested', name: 'Nested', members: ['checkout'] }],
        ids,
      ),
    /Nested/,
  );
});

// Layout findings point to concrete objects without rewriting the architecture or claiming optimality.
test('readability diagnostics identify overlap, vague labels, and ambiguous names', () => {
  const diagram = {
    ...blank,
    nodes: [
      { id: 'a', service: 'custom', name: 'Worker', x: 0, y: 0 },
      { id: 'b', service: 'custom', name: 'Worker', x: 30, y: 30 },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b', verb: 'custom', label: 'uses' }],
  };
  const before = structuredClone(diagram);
  const findings = checkReadability(diagram);
  assert.equal(findings.heuristic, true);
  for (const code of ['overlapping_resources', 'duplicate_name', 'vague_operation'])
    assert.ok(findings.findings.some((item) => item.code === code));
  assert.deepEqual(diagram, before);
  assert.match(readabilityGuide, /never reverse a true operation/);
});

// A service pair lookup returns the catalog's actual allowed labels rather than invented AWS relationships.
test('agent catalog returns documented directional relationships', () => {
  const source = { service: 'lambda' };
  const target = { service: 'dynamodb' };
  const result = {
    relationships: allowedNodeRelationships(source, target).map((verb) => ({
      verb,
      evidence: relationshipEvidence(source.service, verb, target.service),
    })),
  };
  assert.ok(result.relationships.some((row) => row.verb === 'writes to'));
  assert.ok(result.relationships.every((row) => row.evidence.length));
});
