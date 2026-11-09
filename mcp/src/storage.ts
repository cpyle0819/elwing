import type { Owner } from './owner.js';
import type { Diagram, DeleteTarget } from './store-rules.js';
export type Metadata = {
  diagramId: string;
  title: string;
  revision: number;
  nodeCount: number;
  edgeCount: number;
  services: string[];
  servicesTruncated: boolean;
  createdAt: string;
  updatedAt: string;
};
export type DiagramRecord = Metadata & { document: Diagram };
export type CreateArgs = { title: string; document?: Diagram; mutationId: string };
export type ApplyArgs = DeleteTarget & { mutationId: string; operations: any[] };
export type BatchDeleteResult = {
  results: { diagramId: string; status: string; currentRevision?: number }[];
  deletedCount: number;
  notFoundCount: number;
  conflictCount: number;
};
export interface DiagramStorage {
  create(
    owner: Owner,
    args: CreateArgs,
  ): Promise<{ diagramId: string; title: string; revision: number }>;
  get(owner: Owner, id: string): Promise<DiagramRecord>;
  list(
    owner: Owner,
    limit?: number,
    cursor?: string,
  ): Promise<{ items: Metadata[]; nextCursor?: string }>;
  apply(
    owner: Owner,
    args: ApplyArgs,
  ): Promise<{ diagramId: string; revision: number; changed: boolean; operationsApplied: number }>;
  delete(
    owner: Owner,
    args: DeleteTarget & { mutationId: string },
  ): Promise<{ diagramId: string; deleted: boolean }>;
  deleteMany(
    owner: Owner,
    args: { diagrams: DeleteTarget[]; mutationId: string },
  ): Promise<BatchDeleteResult | undefined>;
}
