import { MAX_WAYPOINTS } from './manual-routing.js';
import { attachmentSides, connectorAttachments } from './diagram-presentation.js';
import { verbs, legacyVerbs, relationshipIssue } from '../catalog/relationship-rules.js';
import { resourceTypeMap } from '../catalog/resource-types.js';
import { isGroup, sizeGroups, arrangeGroups, nodeWidth, nodeHeight } from './groups.js';
import {
  MIN_CARD_WIDTH,
  MIN_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  MAX_CARD_HEIGHT,
  MAX_RESOURCE_TEXT,
} from './resource-sizing.js';
import { arrangeLayered } from './layout.js';
export { verbs } from '../catalog/relationship-rules.js';

const MAX_RESOURCES = 200;
const MAX_RELATIONSHIPS = 1000;
const MAX_CUSTOM_LABEL_LENGTH = 240;
const MAX_ICON_LENGTH = 100000;
const MAX_COORDINATE = 100000;
const MAX_GROUP_DIMENSION = 210000;
const PNG_DATA_URL = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/;

function isCustomLabelValid(label) {
  return typeof label === 'string' && !!label.trim() && label.length <= MAX_CUSTOM_LABEL_LENGTH;
}

export function starter() {
  return {
    version: 1,
    title: 'Serverless storefront',
    nodes: [
      {
        id: 'cdn',
        service: 'cloudfront',
        name: 'Web distribution',
        x: 70,
        y: 130,
      },
      {
        id: 'api',
        service: 'apigateway',
        name: 'Storefront API',
        x: 340,
        y: 130,
      },
      { id: 'fn', service: 'lambda', name: 'Order handler', x: 610, y: 130 },
      { id: 'db', service: 'dynamodb', name: 'Orders table', x: 880, y: 130 },
      { id: 'assets', service: 's3', name: 'Static assets', x: 70, y: 360 },
      { id: 'queue', service: 'sqs', name: 'Order events', x: 610, y: 360 },
    ],
    edges: [
      { id: 'e1', source: 'cdn', target: 'api', verb: 'forwards to' },
      { id: 'e2', source: 'api', target: 'fn', verb: 'invokes' },
      { id: 'e3', source: 'fn', target: 'db', verb: 'writes to' },
      { id: 'e4', source: 'cdn', target: 'assets', verb: 'forwards to' },
      { id: 'e5', source: 'fn', target: 'queue', verb: 'sends to' },
    ],
  };
}
function validateSides(sides) {
  if (
    !sides ||
    typeof sides !== 'object' ||
    Array.isArray(sides) ||
    ['sourceSide', 'targetSide'].some(
      (key) => sides[key] !== undefined && !attachmentSides.includes(sides[key]),
    )
  )
    throw Error('Choose Auto, Top, Bottom, Left, or Right for each connection side.');
}
function savedSides(sides) {
  return Object.fromEntries(
    ['sourceSide', 'targetSide']
      .filter((key) => sides[key] !== undefined && sides[key] !== 'auto')
      .map((key) => [key, sides[key]]),
  );
}
function relationshipKey(edge) {
  return JSON.stringify([
    edge.source,
    edge.target,
    edge.verb,
    edge.verb === 'custom' && typeof edge.label === 'string' ? edge.label.trim() : undefined,
    edge.verb === 'custom' ? (edge.connectionType ?? 'flow') : undefined,
    edge.verb === 'custom' ? (edge.sourceSide ?? 'auto') : undefined,
    edge.verb === 'custom' ? (edge.targetSide ?? 'auto') : undefined,
  ]);
}
export function addRelationship(doc, source, verb, target, id, label, sides = {}) {
  if (doc.edges.length >= MAX_RELATIONSHIPS)
    throw Error(
      'A diagram can hold 1,000 relationships. Remove a connection before adding another.',
    );
  validateSides(sides);
  const edge = {
    id,
    source,
    verb,
    target,
    ...(verb === 'custom'
      ? { label: typeof label === 'string' ? label.trim() : label, ...savedSides(sides) }
      : {}),
  };
  validateRelationship(doc, edge);
  doc.edges.push(edge);
}
function validateRelationship(doc, edge, excludedId) {
  const { source, verb, target, label } = edge;
  if (source === target) throw Error('Choose two different resources.');
  const sourceNode = doc.nodes.find((node) => node.id === source);
  const targetNode = doc.nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode) throw Error('Choose a source and target resource.');
  if (!verbs.includes(verb) && verb !== 'custom') throw Error('Choose a supported relationship.');
  if (verb === 'custom' && !isCustomLabelValid(label))
    throw Error('Enter a custom label of 1–240 characters.');
  const issue = relationshipIssue(sourceNode, verb, targetNode);
  if (issue) throw Error(issue);
  if (doc.edges.some((e) => e.id !== excludedId && relationshipKey(e) === relationshipKey(edge)))
    throw Error('This relationship already exists.');
}
// Edits preserve identity and leave the original connection intact when validation fails.
export function updateRelationship(doc, id, source, verb, target, label, sides) {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) throw Error('This relationship no longer exists.');
  if (sides !== undefined) validateSides(sides);
  const next = { ...edge, source, verb, target };
  if (verb === 'custom') {
    next.label = typeof label === 'string' ? label.trim() : label;
    if (sides !== undefined || edge.verb !== 'custom') {
      delete next.sourceSide;
      delete next.targetSide;
      Object.assign(next, savedSides(sides ?? connectorAttachments(edge)));
    }
  } else {
    delete next.label;
    delete next.connectionType;
    delete next.sourceSide;
    delete next.targetSide;
  }
  const previousAttachments = connectorAttachments(edge);
  const nextAttachments = connectorAttachments(next);
  if (
    source !== edge.source ||
    target !== edge.target ||
    previousAttachments.sourceSide !== nextAttachments.sourceSide ||
    previousAttachments.targetSide !== nextAttachments.targetSide
  )
    delete next.waypoints;
  validateRelationship(doc, next, id);
  for (const key of ['label', 'connectionType', 'sourceSide', 'targetSide', 'waypoints'])
    delete edge[key];
  Object.assign(edge, next);
}
export function removeNode(doc, id) {
  for (const node of doc.nodes) if (node.groupId === id) delete node.groupId;
  doc.nodes = doc.nodes.filter((n) => n.id !== id);
  doc.edges = doc.edges.filter((e) => e.source !== id && e.target !== id);
  sizeGroups(doc);
}
export function validateDocument(doc, services) {
  validateDocumentShape(doc);
  const ids = new Set(),
    validatedIcons = new Set();
  for (const node of doc.nodes) {
    validateResource(node, services, ids, validatedIcons);
    ids.add(node.id);
  }
  for (const node of doc.nodes) {
    validateGroupMembership(node, doc.nodes);
  }
  validateImportedRelationships(doc.edges, ids);
  return structuredClone(doc);
}

function validateDocumentShape(doc) {
  if (
    !doc ||
    doc.version !== 1 ||
    typeof doc.title !== 'string' ||
    doc.title.length > 80 ||
    !Array.isArray(doc.nodes) ||
    !Array.isArray(doc.edges) ||
    doc.nodes.length > MAX_RESOURCES ||
    doc.edges.length > MAX_RELATIONSHIPS
  )
    throw Error('Invalid diagram. Import an Elwing JSON export (up to 200 resources).');
}

function validateResource(node, services, ids, validatedIcons) {
  if (
    node?.resourceType !== undefined &&
    resourceTypeMap.get(node.resourceType)?.service !== node.service
  )
    throw Error('Invalid resource type for this service.');
  if (
    node?.icon !== undefined &&
    (node.service !== 'custom' ||
      typeof node.icon !== 'string' ||
      node.icon.length > MAX_ICON_LENGTH ||
      (!validatedIcons.has(node.icon) && !PNG_DATA_URL.test(node.icon)))
  )
    throw Error('Invalid custom icon. Upload an image through the resource panel.');
  if (node?.icon !== undefined) validatedIcons.add(node.icon);
  if (
    !node ||
    typeof node.id !== 'string' ||
    !node.id ||
    ids.has(node.id) ||
    !(services.includes(node.service) || node.service === 'custom' || node.service === 'group') ||
    typeof node.name !== 'string' ||
    node.name.length > (isGroup(node) ? 60 : MAX_RESOURCE_TEXT) ||
    (node.resourceName !== undefined &&
      (node.service !== 'custom' ||
        typeof node.resourceName !== 'string' ||
        !node.resourceName.trim() ||
        node.resourceName.length > 60)) ||
    !Number.isFinite(node.x) ||
    !Number.isFinite(node.y) ||
    Math.abs(node.x) > MAX_COORDINATE ||
    Math.abs(node.y) > MAX_COORDINATE
  )
    throw Error('Invalid resource in diagram.');
}

function validateGroupMembership(node, nodes) {
  if (
    node.groupId !== undefined &&
    (isGroup(node) ||
      typeof node.groupId !== 'string' ||
      !nodes.some((g) => g.id === node.groupId && isGroup(g)))
  )
    throw Error('A resource must belong to an existing group. Nested groups are not supported.');
  for (const key of ['width', 'height'])
    if (
      node[key] !== undefined &&
      (!Number.isFinite(node[key]) ||
        node[key] < (isGroup(node) ? 1 : key === 'width' ? MIN_CARD_WIDTH : MIN_CARD_HEIGHT) ||
        node[key] >
          (isGroup(node)
            ? MAX_GROUP_DIMENSION
            : key === 'width'
              ? MAX_CARD_WIDTH
              : MAX_CARD_HEIGHT))
    )
      throw Error('Invalid card dimensions.');
}

function validateImportedRelationships(edges, ids) {
  const edgeIds = new Set(),
    combinations = new Set();
  for (const edge of edges) {
    if (
      edge?.waypoints !== undefined &&
      (!Array.isArray(edge.waypoints) ||
        edge.waypoints.length > MAX_WAYPOINTS ||
        edge.waypoints.some(
          (point) =>
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            Math.abs(point.x) > MAX_COORDINATE ||
            Math.abs(point.y) > MAX_COORDINATE,
        ))
    )
      throw Error('Connector bends must contain at most 100 points within the canvas limits.');
    const key = edge && relationshipKey(edge);
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      combinations.has(key) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      edge.source === edge.target ||
      ![...verbs, ...legacyVerbs, 'custom'].includes(edge.verb) ||
      (edge.color !== undefined &&
        (typeof edge.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(edge.color))) ||
      (edge.verb === 'custom' && !isCustomLabelValid(edge.label)) ||
      (edge.verb !== 'custom' && edge.label !== undefined) ||
      ['sourceSide', 'targetSide'].some(
        (key) =>
          edge[key] !== undefined &&
          (edge.verb !== 'custom' || !attachmentSides.includes(edge[key])),
      ) ||
      (edge.connectionType !== undefined &&
        (edge.verb !== 'custom' ||
          typeof edge.connectionType !== 'string' ||
          !['flow', 'read', 'write', 'reference'].includes(edge.connectionType)))
    )
      throw Error('Invalid relationship in diagram.');
    edgeIds.add(edge.id);
    combinations.add(key);
  }
}

// Groups are laid out internally, then placed as units in the outer dependency graph.
export function arrange(doc) {
  for (const edge of doc.edges) delete edge.waypoints;
  if (doc.nodes.some(isGroup)) {
    arrangeGroups(doc, arrangeLayered);
    return;
  }
  arrangeLayered(doc);
}
// Pair routing is retained for callers that do not need graph-wide obstacle handling.
export function route(a, b, offset = 0) {
  const down = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  const sx = down ? a.x + nodeWidth(a) / 2 + offset : a.x + (b.x >= a.x ? nodeWidth(a) : 0),
    sy = down ? a.y + (b.y >= a.y ? nodeHeight(a) : 0) : a.y + nodeHeight(a) / 2 + offset;
  const tx = down ? b.x + nodeWidth(b) / 2 + offset : b.x + (b.x >= a.x ? 0 : nodeWidth(b)),
    ty = down ? b.y + (b.y >= a.y ? 0 : nodeHeight(b)) : b.y + nodeHeight(b) / 2 + offset;
  const x = (sx + tx) / 2,
    y = (sy + ty) / 2;
  return {
    d: down
      ? `M ${sx} ${sy} L ${sx} ${y} L ${tx} ${y} L ${tx} ${ty}`
      : `M ${sx} ${sy} L ${x} ${sy} L ${x} ${ty} L ${tx} ${ty}`,
    x,
    y,
  };
}

// A compact reading layout uses bounded columns and advances dependency layers down the page, leaving the saved graph untouched.
export function compactLayout(doc, columns = 1) {
  if (doc.nodes.some(isGroup)) return structuredClone(doc);
  const graph = structuredClone(doc);
  arrange(graph);
  const layers = [...new Set(graph.nodes.map((n) => n.x))].sort((a, b) => a - b);
  let y = 60;
  const columnWidth = Math.max(164, ...graph.nodes.map(nodeWidth)) + 56;
  for (const layer of layers) {
    const nodes = graph.nodes.filter((n) => n.x === layer);
    for (let index = 0; index < nodes.length; index += columns) {
      const row = nodes.slice(index, index + columns);
      row.forEach((node, column) => {
        node.x = 40 + column * columnWidth;
        node.y = y;
      });
      y += Math.max(...row.map(nodeHeight)) + 84;
    }
  }
  return graph;
}
