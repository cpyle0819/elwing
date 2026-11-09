import { resourceTypes } from './resource-types-data.js';
export { resourceTypes };
export const resourceTypeMap = new Map(resourceTypes.map((type) => [type.id, type]));
const byService = new Map();
for (const type of resourceTypes) {
  if (!byService.has(type.service)) byService.set(type.service, []);
  byService.get(type.service).push(type);
}
export const typesForService = (service) => byService.get(service) || [];
export const nodeIconId = (node) => node.resourceType || node.service;
export const nodeTypeName = (node) => resourceTypeMap.get(node.resourceType)?.name;

const fn = ['res-aws-lambda-lambda-function'];
const bucket = [
  'res-amazon-simple-storage-service-bucket',
  'res-amazon-simple-storage-service-bucket-with-objects',
];
const object = [...bucket, 'res-amazon-simple-storage-service-object'];
const table = ['res-amazon-dynamodb-table'];
const stream = ['res-amazon-dynamodb-stream'];
const queue = ['res-amazon-simple-queue-service-queue'];
const topic = ['res-amazon-simple-notification-service-topic'];
const bus = ['res-amazon-eventbridge-default-event-bus', 'res-amazon-eventbridge-custom-event-bus'];
const rule = [...bus, 'res-amazon-eventbridge-rule'];
const sns = 'amazon-simple-notification-service';

// These endpoint refinements use the operation and references of the exact parent catalog row.
// Unlisted resource types do not inherit the parent's integrations, event sources, or audit relationships.
export const resourceTypeApprovals = [
  // Only generic Glue ETL jobs are covered; crawler/catalog/Ray icons do not inherit Spark APIs.
  ['aws-glue', 'reads from', 's3', [], object],
  ['aws-glue', 'writes to', 's3', [], object],
  ['apigateway', 'invokes', 'lambda', [], fn],
  ['apigateway', 'sends to', 'sqs', [], queue],
  ['apigateway', 'reads from', 'sqs', [], queue],
  ['apigateway', 'sends to', 'eventbridge', [], bus],
  ['apigateway', 'reads from', 'dynamodb', [], table],
  ['apigateway', 'writes to', 'dynamodb', [], table],
  ['apigateway', 'reads from', 's3', [], object],
  ['apigateway', 'writes to', 's3', [], object],
  ['lambda', 'invokes', 'lambda', fn, fn],
  ['lambda', 'sends to', 'sqs', fn, queue],
  ['lambda', 'reads from', 'sqs', fn, queue],
  ['sqs', 'handled by', 'lambda', queue, fn],
  ['lambda', 'reads from', 'dynamodb', fn, [...table, ...stream]],
  ['lambda', 'writes to', 'dynamodb', fn, table],
  ['lambda', 'reads from', 's3', fn, object],
  ['lambda', 'writes to', 's3', fn, object],
  ['lambda', 'sends to', 'eventbridge', fn, bus],
  ['lambda', 'publishes to', sns, fn, topic],
  ['cloudfront', 'forwards to', 's3', [], bucket],
  ['cloudfront', 'forwards to', 'lambda', [], fn],
  ['eventbridge', 'invokes', 'lambda', rule, fn],
  ['eventbridge', 'sends to', 'sqs', rule, queue],
  ['eventbridge', 'invokes', 'apigateway', rule, []],
  ['s3', 'invokes', 'lambda', bucket, fn],
  ['s3', 'sends to', 'sqs', bucket, queue],
  ['s3', 'sends to', 'eventbridge', bucket, [bus[0]]],
  ['s3', 'publishes to', sns, bucket, topic],
  [sns, 'sends to', 'sqs', topic, queue],
  ['sqs', 'subscribes to', sns, queue, topic],
  [sns, 'subscribed by', 'sqs', topic, queue],
  ['lambda', 'subscribes to', sns, fn, topic],
  [sns, 'subscribed by', 'lambda', topic, fn],
  ['amazon-data-firehose', 'subscribes to', sns, [], topic],
  [sns, 'subscribed by', 'amazon-data-firehose', topic, []],
  [sns, 'invokes', 'lambda', topic, fn],
];
// A granular read/write endpoint must be approved for both operations; read-only stream types stay read-only.
for (const read of resourceTypeApprovals.filter((row) => row[1] === 'reads from')) {
  const write = resourceTypeApprovals.find(
    (row) => row[0] === read[0] && row[2] === read[2] && row[1] === 'writes to',
  );
  if (!write) continue;
  resourceTypeApprovals.push([
    read[0],
    'reads / writes',
    read[2],
    read[3].filter((type) => write[3].includes(type)),
    read[4].filter((type) => write[4].includes(type)),
  ]);
}

export function resourceTypesAllow(source, verb, target) {
  if (!source?.resourceType && !target?.resourceType) return true;
  const approval = resourceTypeApprovals.find(
    (row) => row[0] === source?.service && row[1] === verb && row[2] === target?.service,
  );
  return (
    !!approval &&
    (!source.resourceType || approval[3].includes(source.resourceType)) &&
    (!target.resourceType || approval[4].includes(target.resourceType))
  );
}
