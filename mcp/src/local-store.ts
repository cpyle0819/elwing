import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { atomicWrite, json, withFolderLock, cleanTemps } from './local-files.js';
import { ownerPartition, type Owner } from './owner.js';
import {
  decodeCursor,
  encodeCursor,
  classifyDeleteTarget,
  validateDeleteTargets,
  StoreError,
  LIMITS,
  diagramId,
  uuidPattern,
  mutation,
  revision,
  digest,
  canonical,
  operationsValid,
  validate,
  applyDocument,
  servicesOf,
  type DeleteTarget,
} from './store-rules.js';
import type {
  DiagramStorage,
  CreateArgs,
  ApplyArgs,
  DiagramRecord,
  Metadata,
  BatchDeleteResult,
} from './storage.js';
export function defaultDataDir(env = process.env, platform = process.platform, home = homedir()) {
  if (env.ELWING_DATA_DIR) return resolve(env.ELWING_DATA_DIR);
  if (platform === 'win32')
    return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Elwing');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Elwing');
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'elwing');
}
type Write = { path: string; value?: unknown };
type Options = {
  directory?: string;
  serviceIds: string[];
  now?: () => number;
  maxDiagrams?: number;
};
export class LocalDiskStore implements DiagramStorage {
  readonly directory: string;
  private now: () => number;
  private initialized = false;
  private nextReceiptCleanup = 0;
  constructor(private options: Options) {
    this.directory = resolve(options.directory || defaultDataDir());
    this.now = options.now || Date.now;
  }
  async initialize() {
    await this.run(async () => {});
  }
  private async run<T>(action: () => Promise<T>): Promise<T> {
    return withFolderLock(this.directory, async () => {
      if (!this.initialized) await cleanTemps(this.directory);
      const marker = await json(join(this.directory, 'store.json'));
      if (marker && marker.format !== 1)
        throw new StoreError('UNAVAILABLE', 'Unsupported data folder format.');
      if (!marker)
        await atomicWrite(join(this.directory, 'store.json'), JSON.stringify({ format: 1 }));
      for (const folder of ['diagrams', 'receipts', 'exports'])
        await mkdir(join(this.directory, folder), { recursive: true, mode: 0o700 });
      const pending = await json(join(this.directory, 'transaction.json'));
      if (pending) await this.finish(pending);
      if (!this.initialized || this.now() >= this.nextReceiptCleanup) {
        await this.cleanReceipts();
        this.nextReceiptCleanup = this.now() + 60 * 60 * 1000;
      }
      this.initialized = true;
      return action();
    });
  }
  private async cleanReceipts() {
    const directory = join(this.directory, 'receipts');
    const now = Math.floor(this.now() / 1000);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/.test(entry.name)) continue;
      const path = join(directory, entry.name);
      const receipt = await json(path);
      if (receipt && receipt.expiresAt <= now) await rm(path, { force: true });
    }
  }
  private owner(owner: Owner) {
    if (ownerPartition(owner) !== 'OWNER#local')
      throw new StoreError('INVALID_ARGUMENT', 'Local storage requires the local owner.');
  }
  private async finish(writes: Write[]) {
    for (const write of writes) {
      if (
        !/^(counter\.json|diagrams\/[0-9a-f-]{36}(\/(meta|diagram)\.json)?|receipts\/[0-9a-f]{64}\.json)$/.test(
          write.path,
        )
      )
        throw new StoreError('UNAVAILABLE', 'Invalid local transaction.');
      const path = join(this.directory, write.path);
      if (write.value === undefined) await rm(path, { recursive: true, force: true });
      else await atomicWrite(path, JSON.stringify(write.value, null, 2) + '\n');
    }
    await rm(join(this.directory, 'transaction.json'), { force: true });
  }
  private async commit(writes: Write[], key: string, hash: string, result: any) {
    writes.push({
      path: `receipts/${digest(key)}.json`,
      value: {
        requestHash: hash,
        result,
        expiresAt: Math.floor(this.now() / 1000) + LIMITS.receiptSeconds,
      },
    });
    await atomicWrite(join(this.directory, 'transaction.json'), JSON.stringify(writes));
    await this.finish(writes);
    return result;
  }
  private async receipt(key: string, hash: string) {
    const receipt = await json(join(this.directory, 'receipts', `${digest(key)}.json`));
    if (!receipt || receipt.expiresAt <= Math.floor(this.now() / 1000)) return;
    if (receipt.requestHash !== hash)
      throw new StoreError(
        'MUTATION_REUSED',
        'mutationId was already used with different arguments.',
      );
    return receipt.result;
  }
  private async metadata(id: string): Promise<Metadata> {
    const item = await json(join(this.directory, 'diagrams', diagramId(id), 'meta.json'));
    if (!item) throw new StoreError('NOT_FOUND', 'Diagram not found.');
    return item;
  }
  private async count() {
    return (await json(join(this.directory, 'counter.json')))?.diagramCount || 0;
  }
  async get(owner: Owner, id: string): Promise<DiagramRecord> {
    this.owner(owner);
    return this.run(async () => ({
      ...(await this.metadata(id)),
      document: await json(join(this.directory, 'diagrams', id, 'diagram.json')),
    }));
  }
  async list(owner: Owner, limit = 50, cursor?: string) {
    this.owner(owner);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new StoreError('INVALID_ARGUMENT', 'limit must be between 1 and 100.');
    const start = decodeCursor(owner, cursor) ?? '';
    return this.run(async () => {
      const ids = (await readdir(join(this.directory, 'diagrams'), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && new RegExp(uuidPattern).test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .filter((id) => id > start);
      const page = ids.slice(0, limit);
      return {
        items: await Promise.all(page.map((id) => this.metadata(id))),
        nextCursor: page.length === limit ? encodeCursor(owner, page.at(-1)!) : undefined,
      };
    });
  }
  async create(owner: Owner, args: CreateArgs) {
    this.owner(owner);
    if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 80)
      throw new StoreError('INVALID_ARGUMENT', 'title must contain 1–80 characters.');
    const key = `RECEIPT#CREATE#${mutation(args.mutationId)}`,
      hash = digest({ action: 'create', ...args });
    return this.run(async () => {
      const replay = await this.receipt(key, hash);
      if (replay !== undefined) return replay;
      const document = structuredClone(
        args.document || { version: 1, title: args.title, nodes: [], edges: [] },
      );
      document.title = args.title;
      validate(document, this.options.serviceIds);
      const count = await this.count();
      if (count >= (this.options.maxDiagrams ?? LIMITS.diagrams))
        throw new StoreError(
          'LIMIT_EXCEEDED',
          'Diagram limit reached. Delete an unused diagram before creating another.',
        );
      const id = randomUUID(),
        time = new Date(this.now()).toISOString();
      const meta = {
        diagramId: id,
        title: args.title,
        revision: 1,
        nodeCount: document.nodes.length,
        edgeCount: document.edges.length,
        ...servicesOf(document, this.options.serviceIds),
        createdAt: time,
        updatedAt: time,
      };
      return this.commit(
        [
          { path: `diagrams/${id}/meta.json`, value: meta },
          { path: `diagrams/${id}/diagram.json`, value: document },
          { path: 'counter.json', value: { diagramCount: count + 1 } },
        ],
        key,
        hash,
        { diagramId: id, revision: 1, title: args.title },
      );
    });
  }
  async apply(owner: Owner, args: ApplyArgs) {
    this.owner(owner);
    const id = diagramId(args.diagramId);
    revision(args.expectedRevision);
    const key = `RECEIPT#${id}#${mutation(args.mutationId)}`,
      hash = digest({ action: 'apply', ...args });
    return this.run(async () => {
      const replay = await this.receipt(key, hash);
      if (replay !== undefined) return replay;
      if (
        !operationsValid(args.operations) ||
        Buffer.byteLength(JSON.stringify(args.operations)) > LIMITS.requestBytes
      )
        throw new StoreError(
          'INVALID_ARGUMENT',
          'Invalid operations or batch exceeds 2 MB. Use the advertised operation schema.',
        );
      const item = await this.metadata(id);
      if (item.revision !== args.expectedRevision)
        throw new StoreError(
          'CONFLICT',
          'Stale expectedRevision. Read the diagram and rebuild the change.',
          item.revision,
        );
      const original = await json(join(this.directory, 'diagrams', id, 'diagram.json'));
      const document = applyDocument(original, args.operations, this.options.serviceIds);
      validate(document, this.options.serviceIds);
      const changed = canonical(original) !== canonical(document),
        next = item.revision + (changed ? 1 : 0);
      const meta = {
        ...item,
        revision: next,
        title: document.title,
        nodeCount: document.nodes.length,
        edgeCount: document.edges.length,
        ...servicesOf(document, this.options.serviceIds),
        updatedAt: changed ? new Date(this.now()).toISOString() : item.updatedAt,
      };
      return this.commit(
        [
          { path: `diagrams/${id}/meta.json`, value: meta },
          { path: `diagrams/${id}/diagram.json`, value: document },
        ],
        key,
        hash,
        { diagramId: id, revision: next, changed, operationsApplied: args.operations.length },
      );
    });
  }
  async delete(owner: Owner, args: DeleteTarget & { mutationId: string }) {
    this.owner(owner);
    const id = diagramId(args.diagramId);
    revision(args.expectedRevision);
    const key = `RECEIPT#${id}#${mutation(args.mutationId)}`,
      hash = digest({ action: 'delete', ...args });
    return this.run(async () => {
      const replay = await this.receipt(key, hash);
      if (replay !== undefined) return replay;
      const item = await this.metadata(id);
      if (item.revision !== args.expectedRevision)
        throw new StoreError(
          'CONFLICT',
          'Stale expectedRevision. Read the diagram before deleting.',
          item.revision,
        );
      return this.commit(
        [
          { path: `diagrams/${id}` },
          { path: 'counter.json', value: { diagramCount: (await this.count()) - 1 } },
        ],
        key,
        hash,
        { diagramId: id, deleted: true },
      );
    });
  }
  async deleteMany(
    owner: Owner,
    args: { diagrams: DeleteTarget[]; mutationId: string },
  ): Promise<BatchDeleteResult> {
    this.owner(owner);
    validateDeleteTargets(args.diagrams);
    const key = `RECEIPT#DELETE#${mutation(args.mutationId)}`,
      hash = digest({ action: 'deleteMany', ...args });
    return this.run(async () => {
      const replay = await this.receipt(key, hash);
      if (replay !== undefined) return replay;
      const results = await Promise.all(
        args.diagrams.map(async (target) => {
          const item = await json(join(this.directory, 'diagrams', target.diagramId, 'meta.json'));
          return classifyDeleteTarget(target, item);
        }),
      );
      const deleted = results.filter((item) => item.status === 'deleted');
      const result = {
        results,
        deletedCount: deleted.length,
        notFoundCount: results.filter((item) => item.status === 'not_found').length,
        conflictCount: results.filter((item) => item.status === 'conflict').length,
      };
      return this.commit(
        [
          ...deleted.map((item) => ({ path: `diagrams/${item.diagramId}` })),
          { path: 'counter.json', value: { diagramCount: (await this.count()) - deleted.length } },
        ],
        key,
        hash,
        result,
      );
    });
  }
  async saveExport(record: DiagramRecord, format: string, data: string, _filename: string) {
    const id = diagramId(record.diagramId);
    revision(record.revision);
    if (!['svg', 'png', 'excalidraw'].includes(format))
      throw new StoreError('INVALID_ARGUMENT', 'Invalid export format.');
    const slug =
      record.title
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'diagram';
    const path = join(this.directory, 'exports', id, `${slug}-r${record.revision}.${format}`);
    await this.run(() => atomicWrite(path, Buffer.from(data, 'base64')));
    return path;
  }
}
