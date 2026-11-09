import { createHash } from 'node:crypto';
import { validateDocument } from 'elwing-diagram-engine/diagram/model';
import { relationshipFeedback } from 'elwing-diagram-engine/catalog/graph';
import { applyOperations } from 'elwing-diagram-engine/agent/operations';
import { operationsSchema } from 'elwing-diagram-engine/agent/tools';
import { Ajv } from 'ajv';
import { ownerPartition, type Owner } from './owner.js';
export type Diagram = { version: number; title: string; nodes: any[]; edges: any[] };
export class StoreError extends Error {
  constructor(
    public code: string,
    message: string,
    public currentRevision?: number,
  ) {
    super(message);
  }
}
export const LIMITS = Object.freeze({
  diagrams: 1000,
  batchDelete: 50,
  listServices: 20,
  requestBytes: 2 * 1024 * 1024,
  receiptSeconds: 86400,
});
export function servicesOf(document: Diagram, serviceIds: readonly string[]) {
  const allowed = new Set(serviceIds);
  const services = [
    ...new Set<string>(
      document.nodes
        .map((node) => node.service)
        .filter((service) => service !== 'group' && service !== 'custom' && allowed.has(service)),
    ),
  ].sort();
  return {
    services: services.slice(0, LIMITS.listServices),
    servicesTruncated: services.length > LIMITS.listServices,
  };
}
export type DeleteTarget = { diagramId: string; expectedRevision: number };
export function classifyDeleteTarget(target: DeleteTarget, item?: { revision: number }) {
  if (!item) return { diagramId: target.diagramId, status: 'not_found' };
  if (item.revision !== target.expectedRevision)
    return { diagramId: target.diagramId, status: 'conflict', currentRevision: item.revision };
  return { diagramId: target.diagramId, status: 'deleted' };
}
export function encodeCursor(owner: Owner, id: string) {
  return Buffer.from(JSON.stringify({ owner: ownerPartition(owner), id })).toString('base64url');
}
export function decodeCursor(owner: Owner, cursor?: string) {
  if (!cursor) return;
  try {
    if (cursor.length > 512) throw Error();
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (decoded.owner !== ownerPartition(owner)) throw Error();
    return diagramId(decoded.id);
  } catch {
    throw new StoreError('INVALID_ARGUMENT', 'Invalid cursor for this owner.');
  }
}

export const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
export const operationsValid = new Ajv({ strict: false }).compile(operationsSchema);
export function diagramId(value: string): string {
  if (typeof value !== 'string' || !new RegExp(uuidPattern).test(value))
    throw new StoreError('INVALID_ARGUMENT', 'Invalid diagramId.');
  return value;
}
export function mutation(value: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(value))
    throw new StoreError(
      'INVALID_ARGUMENT',
      'mutationId must contain 16–64 letters, digits or hyphens.',
    );
  return value;
}
export function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new StoreError('INVALID_ARGUMENT', 'expectedRevision must be a positive integer.');
}
export function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const digest = (value: any) => createHash('sha256').update(canonical(value)).digest('hex');

export function validate(document: Diagram, serviceIds: string[]) {
  if (Buffer.byteLength(JSON.stringify(document)) > LIMITS.requestBytes)
    throw new StoreError('LIMIT_EXCEEDED', 'Diagram exceeds 2 MB.');
  validateDocument(document, serviceIds);
}

export function applyDocument(original: Diagram, operations: any[], serviceIds: string[]) {
  let document: Diagram;
  try {
    document = applyOperations(original, operations, serviceIds);
  } catch (error: any) {
    const nodes = new Map(original.nodes.map((node: any) => [node.id, { ...node }]));
    const edges = new Map(original.edges.map((edge: any) => [edge.id, { ...edge }]));
    for (const operation of operations) {
      if (operation.op === 'upsert_node')
        nodes.set(operation.id, { ...nodes.get(operation.id), ...operation });
      if (operation.op === 'upsert_edge')
        edges.set(operation.id, { ...edges.get(operation.id), ...operation });
      if (operation.op === 'remove_edge') edges.delete(operation.id);
      if (operation.op === 'remove_node') nodes.delete(operation.id);
    }
    const feedback = [...edges.values()].flatMap((edge: any) => {
      const source = nodes.get(edge.source),
        target = nodes.get(edge.target);
      if (!source || !target) return [];
      const message = relationshipFeedback(source, edge.verb, target);
      return message ? [`Edge ${edge.id}: ${message}`] : [];
    });
    throw new StoreError('INVALID_DIAGRAM', [error.message, ...feedback].join('\n'));
  }
  return document;
}

export function validateDeleteTargets(targets: DeleteTarget[]) {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > LIMITS.batchDelete)
    throw new StoreError(
      'INVALID_ARGUMENT',
      `diagrams must contain 1–${LIMITS.batchDelete} targets.`,
    );
  const ids = new Set<string>();
  for (const target of targets) {
    if (
      !target ||
      typeof target !== 'object' ||
      Object.keys(target).some((key) => !['diagramId', 'expectedRevision'].includes(key))
    )
      throw new StoreError(
        'INVALID_ARGUMENT',
        'Each target requires only diagramId and expectedRevision.',
      );
    const id = diagramId(target.diagramId);
    revision(target.expectedRevision);
    if (ids.has(id)) throw new StoreError('INVALID_ARGUMENT', 'Duplicate diagramId in batch.');
    ids.add(id);
  }
}
