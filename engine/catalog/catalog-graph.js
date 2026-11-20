import { readFileSync } from 'node:fs';
import {
  documentedRelationships,
  relationshipIssue,
  allowedRelationships,
  allowedNodeRelationships,
} from './relationship-rules.js';
import { resourceTypes, resourceTypeApprovals } from './resource-types.js';
import { FLOWCHART_SHAPES } from '../diagram/flowchart.js';

const services = JSON.parse(readFileSync(new URL('./services.json', import.meta.url), 'utf8'));

export function catalogGraph() {
  return {
    services: services.map(({ id, name }) => ({ id, name })),
    diagramPrimitives: {
      group: {
        service: 'group',
        membershipField: 'groupId',
        nestedGroups: false,
        relationships: 'custom',
        automaticBounds: true,
      },
      custom: { service: 'custom', relationships: 'custom' },
      flowchart: {
        service: 'flowchart',
        shapes: [...FLOWCHART_SHAPES],
        relationships: 'flow',
        optionalLabel: true,
        groups: false,
        arrange: 'top to bottom when every node is a flowchart shape',
      },
      flowExample: {
        nodes: [
          {
            id: 'start',
            service: 'flowchart',
            shape: 'start-end',
            name: 'Order placed',
            x: 0,
            y: 0,
          },
          { id: 'check', service: 'flowchart', shape: 'decision', name: 'In stock?', x: 0, y: 0 },
          { id: 'ship', service: 'flowchart', shape: 'process', name: 'Ship order', x: 0, y: 0 },
          { id: 'notify', service: 'lambda', name: 'Back-order notifier', x: 0, y: 0 },
        ],
        edges: [
          { id: 'f1', source: 'start', target: 'check', verb: 'flow' },
          { id: 'f2', source: 'check', target: 'ship', verb: 'flow', label: 'Yes' },
          { id: 'f3', source: 'check', target: 'notify', verb: 'flow', label: 'No' },
        ],
      },
      groupExample: {
        nodes: [
          { id: 'app', service: 'group', name: 'Checkout', x: 0, y: 0 },
          { id: 'events', service: 'group', name: 'Fulfillment', x: 400, y: 0 },
          { id: 'worker', service: 'lambda', name: 'Publisher', groupId: 'app', x: 28, y: 56 },
          { id: 'queue', service: 'sqs', name: 'Event queue', groupId: 'events', x: 428, y: 56 },
        ],
        edges: [
          {
            id: 'system-link',
            source: 'app',
            target: 'events',
            verb: 'custom',
            label: 'sends events',
          },
        ],
      },
    },
    resourceTypes: resourceTypes.map(({ id, service, name }) => ({ id, service, name })),
    relationships: documentedRelationships.map(({ source, verb, target }) => [
      source,
      verb,
      target,
    ]),
    resourceTypeApprovals,
  };
}

export function relationshipFeedback(source, verb, target) {
  const issue = relationshipIssue(source, verb, target);
  if (!issue) return null;
  const allowed = allowedNodeRelationships(source, target);
  const general = allowedRelationships(source.service, target.service);
  return `${issue} Source type: ${source.resourceType || 'general service'}; target type: ${target.resourceType || 'general service'}. Allowed verbs for these exact nodes: ${allowed.join(', ') || 'none'}. With optional resourceType fields omitted on both endpoints, the service-level verbs are: ${general.join(', ') || 'none'}. Reconsider optional granularity, endpoints, and the operation; do not disguise an invalid operation as Custom.`;
}
