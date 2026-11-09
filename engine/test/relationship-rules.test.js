import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  verbs,
  documentedRelationships,
  relationshipRules,
  ruleReferences,
  relationshipApiReferences,
  allowedRelationships,
  graphRelationshipIssues,
  serviceExclusions,
} from '../catalog/relationship-rules.js';
import {
  starter,
  addRelationship,
  updateRelationship,
  validateDocument,
} from '../diagram/model.js';
const services = JSON.parse(
  readFileSync(new URL('../catalog/services.json', import.meta.url), 'utf8'),
);

// Every global verb and allowed pair derives from a reviewed claim with an operation, scope, and official source.
test('vocabulary is exactly the union of sourced relationship claims', () => {
  const ids = new Set(services.map((s) => s.id)),
    claims = new Set();
  assert.deepEqual(verbs, [...new Set(documentedRelationships.map((row) => row.verb))]);
  assert.ok(!verbs.includes('authenticates with'));
  for (const row of documentedRelationships) {
    assert.ok(ids.has(row.source) && ids.has(row.target));
    const claim = JSON.stringify([row.source, row.verb, row.target]);
    assert.ok(!claims.has(claim));
    claims.add(claim);
    assert.ok(row.operation && row.condition && row.reviewed && row.references.length);
    for (const ref of row.references) {
      assert.match(
        ruleReferences[ref].url,
        /^https:\/\/(docs\.aws\.amazon\.com|aws\.amazon\.com|d1\.awsstatic\.com|docs\.thinkboxsoftware\.com|www\.docs\.o3de\.org)\//,
      );
      assert.ok(ruleReferences[ref].summary);
    }
  }
  for (const row of relationshipRules)
    assert.deepEqual(row.allowed, [
      ...new Set(
        documentedRelationships
          .filter((c) => c.source === row.source && c.target === row.target)
          .map((c) => c.verb),
      ),
    ]);
});

// Message delivery, polling, invocation, DNS, forwarding, and authorization retain documented meanings and direction.
test('removes generic shortcuts and denies undocumented pairs', () => {
  assert.deepEqual(allowedRelationships('apigateway', 'lambda'), ['invokes']);
  assert.deepEqual(allowedRelationships('apigateway', 'sqs'), [
    'sends to',
    'reads from',
    'deletes from',
  ]);
  assert.deepEqual(allowedRelationships('lambda', 'dynamodb'), [
    'reads from',
    'writes to',
    'reads / writes',
  ]);
  assert.deepEqual(allowedRelationships('lambda', 'apigateway'), []);
  assert.deepEqual(allowedRelationships('sqs', 'lambda'), ['handled by']);
  assert.deepEqual(allowedRelationships('dynamodb', 'lambda'), []);
  assert.deepEqual(allowedRelationships('cloudfront', 'apigateway'), ['forwards to']);
  assert.deepEqual(allowedRelationships('route53', 'apigateway'), ['routes to']);
  assert.deepEqual(allowedRelationships('apigateway', 'cognito'), ['authorizes with']);
  assert.deepEqual(allowedRelationships('sqs', 'amazon-simple-notification-service'), [
    'subscribes to',
  ]);
  const copy = allowedRelationships('apigateway', 'lambda');
  copy.push('subscribes to');
  assert.deepEqual(allowedRelationships('apigateway', 'lambda'), ['invokes']);
});

// New and edited unsupported edges fail atomically; existing labels remain readable without being treated as valid claims.
test('enforces writes without discarding existing diagrams', () => {
  const doc = starter(),
    before = structuredClone(doc);
  assert.throws(() => addRelationship(doc, 'api', 'subscribes to', 'fn', 'bad'), /not documented/);
  assert.throws(() => updateRelationship(doc, 'e2', 'api', 'routes to', 'fn'), /not documented/);
  assert.deepEqual(doc, before);
  addRelationship(doc, 'api', 'sends to', 'queue', 'direct');
  doc.edges.find((e) => e.id === 'e2').verb = 'authenticates with';
  assert.deepEqual(
    validateDocument(
      doc,
      services.map((s) => s.id),
    ),
    doc,
  );
  assert.equal(graphRelationshipIssues(doc).length, 1);
  updateRelationship(doc, 'e2', 'api', 'invokes', 'fn');
  assert.deepEqual(graphRelationshipIssues(doc), []);
});

// Every relationship exposes only explicit API references, independently of its supporting guides.
test('popup links cover every relationship with API references only', () => {
  for (const row of documentedRelationships) {
    assert.ok(row.apiReferences?.length, `${row.source} ${row.verb} ${row.target}`);
    for (const key of row.apiReferences) {
      const reference = relationshipApiReferences[key];
      assert.ok(reference?.label);
      const awsApi =
        /^https:\/\/docs\.aws\.amazon\.com\/(.+\/(api|API|APIReference|DDOSAPIReference|apireference|api-reference)\/[^/]+|prometheus\/latest\/userguide\/AMP-APIReference-RemoteWrite)\.html$/;
      const artistApis = new Set([
        'https://docs.thinkboxsoftware.com/products/stoke/2.7/1_Documentation/manual/reflowtools/maxscript_exposure.html',
        'https://docs.thinkboxsoftware.com/products/xmesh/1.10/1_Documentation/manual/xmesh_mx/xmesh_mx_saver/ref_maxscript_interface.html',
      ]);
      const glueSdkApis = new Set([
        'https://docs.aws.amazon.com/glue/latest/dg/aws-glue-api-crawler-pyspark-extensions-dynamic-frame-reader.html',
        'https://docs.aws.amazon.com/glue/latest/dg/aws-glue-api-crawler-pyspark-extensions-dynamic-frame-writer.html',
      ]);
      assert.ok(
        awsApi.test(reference.url) ||
          artistApis.has(reference.url) ||
          glueSdkApis.has(reference.url),
        reference.url,
      );
    }
  }
  assert.deepEqual(
    documentedRelationships.find(
      (row) => row.source === 'lambda' && row.target === 'dynamodb' && row.verb === 'writes to',
    ).apiReferences,
    ['putItem'],
  );
});

// Direct event arrows require a direct-delivery claim; CloudTrail-only evidence never implies a direct EventBridge integration.
test('service-event expansion preserves the CloudTrail intermediary', async () => {
  const { serviceEventRelationships } = await import('../catalog/service-event-relationships.js');
  const pages = JSON.parse(
    readFileSync(new URL('../catalog-sources/service-events.json', import.meta.url), 'utf8'),
  );
  for (const row of serviceEventRelationships) {
    const evidence = pages.filter((page) =>
      row.references.includes(
        `serviceEvents_${page.page.replace('events-ref-', '').replace('.html', '')}`,
      ),
    );
    assert.ok(evidence.length);
    assert.ok(evidence.every((page) => page.id === row.source));
    if (row.target === 'eventbridge') {
      assert.ok(evidence.every((page) => page.directEvents.length > 0));
      assert.equal(row.verb, 'sends to');
      for (const page of evidence) assert.ok(row.condition.includes(page.eventSource));
    } else {
      assert.equal(row.target, 'aws-cloudtrail');
      assert.equal(row.verb, 'logs to');
      assert.ok(evidence.every((page) => page.cloudTrail));
    }
  }
  assert.ok(allowedRelationships('aws-cloudtrail', 'eventbridge').includes('sends to'));
});

// Coverage reports track the actual catalog and cannot count missing IDs or hide pending work.
test('coverage audit accounts for every catalog entry', () => {
  const report = JSON.parse(
    readFileSync(new URL('../catalog-sources/relationship-coverage.json', import.meta.url), 'utf8'),
  );
  const connected = new Set(documentedRelationships.flatMap((row) => [row.source, row.target]));
  const excluded = new Set(serviceExclusions.map((entry) => entry.id));
  const pending = services
    .filter((service) => !connected.has(service.id) && !excluded.has(service.id))
    .map(({ id, name }) => ({ id, name }));
  assert.equal(report.total, services.length);
  assert.equal(report.connected, connected.size);
  assert.equal(report.relationships, documentedRelationships.length);
  assert.deepEqual(report.pending, pending);
  assert.deepEqual(report.excluded, serviceExclusions);
  assert.deepEqual(
    pending,
    [],
    'Every catalog entry needs a documented connection or an evidenced exclusion',
  );
  assert.equal(report.connected + report.pending.length + report.excluded.length, services.length);
  for (const entry of serviceExclusions) {
    assert.ok(services.some((service) => service.id === entry.id));
    assert.ok(!connected.has(entry.id));
    assert.ok(entry.reason && entry.reviewed && entry.references.length);
    for (const reference of entry.references)
      assert.match(reference.url, /^https:\/\/(docs\.aws\.amazon\.com|aws\.amazon\.com)\//);
  }
});

// Retired products cannot regain selectable edges through historical events, and the DeepRacer replacement uses its own documented runtime.
test('retirement and replacement evidence overrides archived integrations', () => {
  for (const id of [
    'aws-panorama',
    'amazon-lookout-for-vision',
    'aws-elemental-mediastore',
    'aws-iot-events',
    'aws-iq',
    'amazon-workdocs',
    'amazon-workdocs-sdk',
    'aws-simspace-weaver',
    'aws-snowball',
    'aws-snowball-edge',
  ]) {
    assert.ok(serviceExclusions.some((entry) => entry.id === id && entry.kind === 'retired'));
    assert.deepEqual(allowedRelationships(id, 'eventbridge'), []);
    assert.deepEqual(allowedRelationships(id, 'aws-cloudtrail'), []);
  }
  assert.deepEqual(allowedRelationships('aws-deepracer', 'aws-cloudtrail'), []);
  assert.deepEqual(allowedRelationships('aws-deepracer', 'amazon-sagemaker-ai'), ['trains with']);
  const doc = {
    nodes: [
      { id: 'old', service: 'aws-elemental-mediastore', name: 'Old origin' },
      { id: 'audit', service: 'aws-cloudtrail', name: 'Audit' },
    ],
    edges: [{ id: 'legacy', source: 'old', target: 'audit', verb: 'logs to' }],
  };
  const before = structuredClone(doc);
  assert.match(graphRelationshipIssues(doc)[0], /discontinued|November 13, 2025/);
  assert.deepEqual(doc, before);
});

// Existing software and services closed only to new customers retain explicitly scoped connections.
test('existing and limited-availability connections retain their documented scope', () => {
  assert.deepEqual(allowedRelationships('cloudfront', 'aws-elemental-delta'), ['forwards to']);
  const delta = documentedRelationships.find((row) => row.target === 'aws-elemental-delta');
  assert.match(delta.condition, /self-managed/);
  const monitron = documentedRelationships.find(
    (row) => row.source === 'amazon-monitron' && row.target === 'aws-cloudtrail',
  );
  assert.ok(monitron);
  assert.match(monitron.condition, /existing customers/);
  assert.ok(
    monitron.references.some((ref) => ruleReferences[ref].url.endsWith('/what-is-monitron.html')),
  );
});

// Every supported SNS endpoint has both subscription directions backed by Subscribe, while delivery remains a distinct operation.
test('SNS subscription directions share Subscribe evidence and preserve delivery edges', () => {
  const sns = 'amazon-simple-notification-service';
  for (const endpoint of ['sqs', 'lambda', 'amazon-data-firehose']) {
    assert.ok(allowedRelationships(endpoint, sns).includes('subscribes to'));
    assert.equal(allowedRelationships(sns, endpoint)[0], 'subscribed by');
    for (const [source, verb, target] of [
      [endpoint, 'subscribes to', sns],
      [sns, 'subscribed by', endpoint],
    ]) {
      const claim = documentedRelationships.find(
        (row) => row.source === source && row.verb === verb && row.target === target,
      );
      assert.equal(claim.operation, 'Subscribe');
      assert.deepEqual(claim.apiReferences, ['subscribe']);
      assert.equal(
        ruleReferences[claim.references[0]].url,
        'https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html',
      );
      const graph = {
        version: 1,
        title: 'Subscription',
        nodes: [
          { id: 'source', service: source, name: source, x: 0, y: 0 },
          { id: 'target', service: target, name: target, x: 300, y: 0 },
        ],
        edges: [],
      };
      addRelationship(graph, 'source', verb, 'target', 'subscription');
      assert.deepEqual(
        validateDocument(
          graph,
          services.map((service) => service.id),
        ),
        graph,
      );
    }
  }
  assert.ok(allowedRelationships(sns, 'sqs').includes('sends to'));
  assert.ok(allowedRelationships(sns, 'lambda').includes('invokes'));
});

// Combined access preserves both operations' evidence and cannot appear for a pair with only one documented access mode.
test('read/write choices derive exactly from documented read and write pairs', () => {
  for (const read of documentedRelationships.filter((row) => row.verb === 'reads from')) {
    const write = documentedRelationships.find(
      (row) => row.source === read.source && row.target === read.target && row.verb === 'writes to',
    );
    const combined = documentedRelationships.find(
      (row) =>
        row.source === read.source && row.target === read.target && row.verb === 'reads / writes',
    );
    assert.equal(Boolean(combined), Boolean(write));
    if (!write) continue;
    assert.deepEqual(
      new Set(combined.references),
      new Set([...read.references, ...write.references]),
    );
    assert.deepEqual(
      new Set(combined.apiReferences),
      new Set([...read.apiReferences, ...write.apiReferences]),
    );
  }
  for (const target of ['dynamodb', 's3'])
    assert.ok(allowedRelationships('lambda', target).includes('reads / writes'));
  assert.ok(!allowedRelationships('lambda', 'sqs').includes('reads / writes'));
  const doc = starter();
  updateRelationship(doc, 'e3', 'fn', 'reads / writes', 'db');
  assert.equal(doc.edges.find((edge) => edge.id === 'e3').verb, 'reads / writes');
  assert.deepEqual(
    validateDocument(
      doc,
      services.map((service) => service.id),
    ),
    doc,
  );
});

test('Glue ETL data access is sourced, literal and does not authorize reverse or crawler operations', async () => {
  const { allowedNodeRelationships } = await import('../catalog/relationship-rules.js');
  for (const target of ['rds', 'amazon-redshift', 's3']) {
    assert.deepEqual(allowedRelationships('aws-glue', target), [
      'reads from',
      'writes to',
      'reads / writes',
    ]);
    assert.deepEqual(allowedRelationships(target, 'aws-glue'), []);
    const claims = documentedRelationships.filter(
      (row) => row.source === 'aws-glue' && row.target === target,
    );
    assert.ok(
      claims.every(
        (row) => row.operation.includes('DynamicFrame') && row.condition.includes('job'),
      ),
    );
  }
  assert.ok(
    allowedNodeRelationships(
      { service: 'aws-glue' },
      { service: 's3', resourceType: 'res-amazon-simple-storage-service-bucket' },
    ).includes('writes to'),
  );
  for (const resourceType of [
    'res-aws-glue-crawler',
    'res-aws-glue-data-catalog',
    'res-aws-glue-aws-glue-for-ray',
  ])
    assert.deepEqual(
      allowedNodeRelationships({ service: 'aws-glue', resourceType }, { service: 's3' }),
      [],
    );
});
