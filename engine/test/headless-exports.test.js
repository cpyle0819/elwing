import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { catalogGraph, relationshipFeedback } from 'elwing-diagram-engine/catalog/graph';
import { designRules } from 'elwing-diagram-engine/guidance/design-rules';
import { applyOperations as exportedApply } from 'elwing-diagram-engine/agent/operations';
import { applyOperations } from '../operations/diagram-operations.js';

const baseline = JSON.parse(
  readFileSync(new URL('./headless-baseline.json', import.meta.url), 'utf8'),
);
const blank = { version: 1, title: 'Blank', nodes: [], edges: [] };
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

test('every headless entry point imports in Node without browser globals', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      const name = 'elwing-diagram-engine';
      const pkg = JSON.parse(readFileSync(new URL(import.meta.resolve(name + '/package.json'))));
      for (const key of ['window', 'document', 'Worker', 'localStorage']) {
        Object.defineProperty(globalThis, key, { get() { throw Error('Browser global: ' + key); } });
      }
      for (const [entry, target] of Object.entries(pkg.exports)) {
        if (!target.endsWith('.js')) continue;
        assert.ok(Object.keys(await import(name + entry.slice(1))).length, entry);
      }
      const services = JSON.parse(readFileSync(new URL(import.meta.resolve(name + '/services.json'))));
      assert.ok(services.some(service => service.id === 'lambda'));
      assert.match(readFileSync(new URL(import.meta.resolve(name + '/assets/lambda.svg')), 'utf8'), /<svg/);
      assert.equal(
        (await import('./diagram/model.js')).validateDocument,
        (await import(name + '/diagram/model')).validateDocument,
      );
      `,
    ],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
});

test('design rules match the approved guidance baseline', () => {
  assert.equal(sha256(designRules), baseline.designRulesSha256);
  assert.ok(designRules.includes('Make arrow semantics literal'));
  assert.ok(designRules.includes('At most 200 nodes and 1000 edges.'));
  assert.ok(!designRules.includes('Return only a JSON object'));
  assert.ok(!designRules.includes('notes is an array'));
  assert.ok(!designRules.includes('Return the complete resulting diagram, not a patch.'));
});

test('catalog retains approved relationships and returns independent examples', () => {
  const original = catalogGraph();
  const etlAddition = (row) =>
    row[0] === 'aws-glue' && ['rds', 'amazon-redshift', 's3'].includes(row[2]);
  assert.equal(original.relationships.filter(etlAddition).length, 9);
  assert.equal(original.resourceTypeApprovals.filter(etlAddition).length, 3);
  original.relationships = original.relationships.filter((row) => !etlAddition(row));
  original.resourceTypeApprovals = original.resourceTypeApprovals.filter(
    (row) => !etlAddition(row),
  );
  assert.equal(sha256(JSON.stringify(original)), baseline.catalogSha256);
  const changed = catalogGraph();
  changed.diagramPrimitives.groupExample.nodes[0].name = 'Other';
  assert.equal(catalogGraph().diagramPrimitives.groupExample.nodes[0].name, 'Checkout');
});

test('relationship feedback preserves rejection details and accepts valid relationships', () => {
  const diagram = baseline.invalidDiagram;
  const [source, target] = diagram.nodes;
  const feedback = relationshipFeedback(source, 'invokes', target);
  assert.equal(`Edge bad: ${feedback}`, baseline.relationshipIssues[0]);
  assert.match(feedback, /Allowed verbs for these exact nodes:/);
  assert.match(feedback, /service-level verbs are:/);
  assert.match(feedback, /do not disguise an invalid operation as Custom/);
  assert.equal(relationshipFeedback(source, 'sends to', target), null);
});

test('headless batches expose the pure operation function through the package alias', () => {
  assert.equal(exportedApply, applyOperations);
  const services = catalogGraph().services.map(({ id }) => id);
  const original = structuredClone(blank);
  const edited = exportedApply(original, [{ op: 'rename_diagram', title: 'Edited' }], services);
  assert.equal(edited.title, 'Edited');
  assert.deepEqual(original, blank);
});
