import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resourceTypes,
  resourceTypeMap,
  resourceTypeApprovals,
} from '../catalog/resource-types.js';
import {
  allowedNodeRelationships,
  documentedRelationships,
  relationshipIssue,
} from '../catalog/relationship-rules.js';
import { starter, validateDocument, addRelationship } from '../diagram/model.js';
const services = JSON.parse(readFileSync(new URL('../catalog/services.json', import.meta.url))).map(
  (s) => s.id,
);
const type = (service, name) =>
  resourceTypes.find((t) => t.service === service && t.name === name).id;

// Every imported type has a stable service parent and an available official SVG.
test('resource icon catalog has valid parents and unique assets', () => {
  assert.ok(resourceTypes.length > 300);
  assert.equal(resourceTypeMap.size, resourceTypes.length);
  for (const t of resourceTypes) {
    assert.ok(services.includes(t.service));
    assert.match(t.id, /^res-[a-z0-9-]+$/);
    assert.match(
      readFileSync(new URL(`../catalog/icons/${t.id}.svg`, import.meta.url), 'utf8'),
      /<svg/,
    );
  }
});

// Type refinements reference existing documented triples and only attach icons belonging to the correct service.
test('resource type approvals are subsets of the evidence catalog', () => {
  for (const [source, verb, target, sources, targets] of resourceTypeApprovals) {
    const row = documentedRelationships.find(
      (r) => r.source === source && r.verb === verb && r.target === target,
    );
    assert.ok(row, `${source} ${verb} ${target}`);
    assert.ok(row.references.length);
    assert.ok(row.apiReferences.length);
    for (const id of sources) assert.equal(resourceTypeMap.get(id)?.service, source);
    for (const id of targets) assert.equal(resourceTypeMap.get(id)?.service, target);
  }
});

// Typed diagrams retain node identity and connections through JSON and reject mismatched or unknown resource types.
test('resource types persist without changing the service or existing edges', () => {
  const doc = starter();
  doc.nodes.find((n) => n.id === 'assets').resourceType = type('s3', 'Bucket');
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc)), services), doc);
  for (const invalid of ['missing', type('dynamodb', 'Table'), null]) {
    const next = structuredClone(doc);
    next.nodes.find((n) => n.id === 'assets').resourceType = invalid;
    assert.throws(() => validateDocument(next, services), /resource type/);
  }
});

// Messages and other unreviewed subtypes cannot inherit queue integrations.
test('typed endpoints restrict documented connections and retain custom edges', () => {
  const doc = starter(),
    source = doc.nodes.find((n) => n.id === 'fn'),
    target = doc.nodes.find((n) => n.id === 'queue');
  source.resourceType = type('lambda', 'Lambda Function');
  target.resourceType = type('sqs', 'Queue');
  assert.ok(allowedNodeRelationships(source, target).includes('sends to'));
  target.resourceType = type('sqs', 'Message');
  assert.deepEqual(allowedNodeRelationships(source, target), []);
  assert.ok(relationshipIssue(source, 'sends to', target));
  assert.throws(() => addRelationship(doc, 'fn', 'sends to', 'queue', 'typed'), /not documented/);
  addRelationship(doc, 'fn', 'custom', 'queue', 'custom', 'Produces message');
  assert.equal(relationshipIssue(source, 'custom', target), null);
});

// Topic, queue and function icons expose the same subscription choices as their parent services; a message cannot subscribe.
test('granular SNS subscriptions work in both directions', () => {
  const sns = 'amazon-simple-notification-service';
  const topicNode = {
    id: 'topic',
    service: sns,
    name: 'Events',
    resourceType: type(sns, 'Topic'),
    x: 0,
    y: 0,
  };
  for (const [service, name] of [
    ['sqs', 'Queue'],
    ['lambda', 'Lambda Function'],
  ]) {
    const endpoint = {
      id: 'endpoint',
      service,
      name,
      resourceType: type(service, name),
      x: 170,
      y: 0,
    };
    assert.ok(allowedNodeRelationships(topicNode, endpoint).includes('subscribed by'));
    assert.ok(allowedNodeRelationships(endpoint, topicNode).includes('subscribes to'));
  }
  const message = { service: 'sqs', resourceType: type('sqs', 'Message') };
  assert.deepEqual(allowedNodeRelationships(topicNode, message), []);
  assert.deepEqual(allowedNodeRelationships(message, topicNode), []);
});

// Combined access permits DynamoDB tables and S3 buckets but cannot inherit read-only DynamoDB Stream access.
test('granular read/write requires both operation approvals', () => {
  const source = { service: 'lambda', resourceType: type('lambda', 'Lambda Function') };
  for (const [service, name] of [
    ['dynamodb', 'Table'],
    ['s3', 'Bucket'],
  ]) {
    const target = { service, resourceType: type(service, name) };
    assert.ok(allowedNodeRelationships(source, target).includes('reads / writes'));
  }
  const stream = { service: 'dynamodb', resourceType: type('dynamodb', 'Stream') };
  assert.ok(allowedNodeRelationships(source, stream).includes('reads from'));
  assert.ok(!allowedNodeRelationships(source, stream).includes('reads / writes'));
});

// SQS queue handling is selectable for Lambda functions and uses output-to-input attachment sides.
test('SQS handled by Lambda supports queue and function icons', async () => {
  const { connectorAttachments } = await import('../diagram/diagram-presentation.js');
  const source = {
    id: 'queue',
    service: 'sqs',
    resourceType: 'res-amazon-simple-queue-service-queue',
  };
  const target = {
    id: 'handler',
    service: 'lambda',
    resourceType: 'res-aws-lambda-lambda-function',
  };
  assert.ok(allowedNodeRelationships(source, target).includes('handled by'));
  assert.deepEqual(connectorAttachments({ verb: 'handled by' }), {
    sourceSide: 'right',
    targetSide: 'left',
  });
});
