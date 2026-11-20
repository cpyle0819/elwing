// Regenerates the example images used by the feature docs.
// Drives the local MCP server over stdio with the same tool calls the docs show.
// Install dependencies and build the server first, then run from the repository root:
//   npm ci && npm run build
//   node docs/features/generate-images.mjs
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = dirname(fileURLToPath(import.meta.url));
const root = join(docs, '../..');
const requireFromRoot = createRequire(join(root, 'package.json'));
const { Client } = await import(requireFromRoot.resolve('@modelcontextprotocol/client'));
const { StdioClientTransport } = await import(
  requireFromRoot.resolve('@modelcontextprotocol/client/stdio')
);

const dataDir = await mkdtemp(join(tmpdir(), 'elwing-docs-'));
const client = new Client({ name: 'elwing-feature-docs', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'dist/stdio.js'), '--data-dir', dataDir],
    stderr: 'pipe',
  }),
);

const call = async (name, args) => {
  const result = await client.callTool({ name: `elwing_${name}`, arguments: args });
  if (result.isError) throw Error(`${name}: ${JSON.stringify(result.content)}`);
  return result;
};
const revisions = new Map();
const create = async (title) => {
  const { diagramId } = (await call('create_diagram', { title, mutationId: randomUUID() }))
    .structuredContent;
  revisions.set(diagramId, 1);
  return diagramId;
};
const apply = async (diagramId, operations) => {
  const { revision } = (
    await call('apply_diagram_changes', {
      diagramId,
      expectedRevision: revisions.get(diagramId),
      mutationId: randomUUID(),
      operations,
    })
  ).structuredContent;
  revisions.set(diagramId, revision);
};
const check = async (diagramId) => {
  const { findingCount } = (await call('check_readability', { diagramId })).structuredContent;
  console.log(`readability findings: ${findingCount}`);
  return findingCount;
};
const save = async (diagramId, path, format = 'png', background = '#ffffff') => {
  const args = { diagramId, format, ...(background && { background }) };
  const result = await call('export_diagram', args);
  const { resource } = result.content.find((item) => item.type === 'resource');
  const target = join(docs, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, resource.blob ? Buffer.from(resource.blob, 'base64') : resource.text);
  console.log(`wrote docs/features/${path}`);
};

const photoUploads = [
  { op: 'upsert_node', id: 'api', service: 'apigateway', name: 'Upload API' },
  { op: 'upsert_node', id: 'resize', service: 'lambda', name: 'Resize photos' },
  { op: 'upsert_node', id: 'photos', service: 's3', name: 'Photo bucket' },
  { op: 'upsert_node', id: 'meta', service: 'dynamodb', name: 'Photo metadata' },
  { op: 'upsert_node', id: 'queue', service: 'sqs', name: 'Thumbnail jobs' },
  { op: 'upsert_node', id: 'thumbs', service: 'lambda', name: 'Make thumbnails' },
  { op: 'upsert_edge', id: 'e1', source: 'api', target: 'resize', verb: 'invokes' },
  { op: 'upsert_edge', id: 'e2', source: 'resize', target: 'photos', verb: 'writes to' },
  { op: 'upsert_edge', id: 'e3', source: 'resize', target: 'meta', verb: 'writes to' },
  { op: 'upsert_edge', id: 'e4', source: 'resize', target: 'queue', verb: 'sends to' },
  { op: 'upsert_edge', id: 'e5', source: 'queue', target: 'thumbs', verb: 'handled by' },
  { op: 'upsert_edge', id: 'e6', source: 'thumbs', target: 'photos', verb: 'writes to' },
  {
    op: 'set_group',
    id: 'processing',
    name: 'Image processing',
    members: ['resize', 'queue', 'thumbs'],
  },
  { op: 'arrange' },
];

try {
  const photo = await create('Photo uploads');
  await apply(photo, photoUploads);
  await check(photo);
  await save(photo, 'diagrams/images/architecture-photo-uploads.png');

  await apply(photo, [
    { op: 'upsert_node', id: 'signin', service: 'cognito', name: 'User sign-in' },
    { op: 'upsert_edge', id: 'auth', source: 'api', target: 'signin', verb: 'authorizes with' },
    { op: 'upsert_node', id: 'meta', name: 'Photo index' },
    { op: 'rename_diagram', title: 'Photo uploads with sign-in' },
    { op: 'arrange' },
  ]);
  await check(photo);
  await save(photo, 'diagrams/images/editing-after.png');

  await apply(photo, [
    { op: 'upsert_node', id: 'signin', badge: { label: 'NEW' } },
    { op: 'upsert_node', id: 'meta', badge: { label: 'CHANGED', color: '#9a5b00' } },
    { op: 'arrange' },
  ]);
  await save(photo, 'diagrams/images/badges-photo-uploads.png');

  const flow = await create('Order approval');
  const shape = (id, kind, name) => ({
    op: 'upsert_node',
    id,
    service: 'flowchart',
    shape: kind,
    name,
  });
  const arrow = (id, source, target, label) => ({
    op: 'upsert_edge',
    id,
    source,
    target,
    verb: 'flow',
    ...(label && { label }),
  });
  await apply(flow, [
    shape('start', 'start-end', 'Order received'),
    shape('details', 'input-output', 'Read payment details'),
    shape('stock', 'decision', 'In stock?'),
    shape('charge', 'subprocess', 'Charge card'),
    shape('ship', 'process', 'Ship order'),
    shape('notice', 'document', 'Back-order notice'),
    shape('end', 'start-end', 'Done'),
    arrow('f1', 'start', 'details'),
    arrow('f2', 'details', 'stock'),
    arrow('f3', 'stock', 'charge', 'Yes'),
    arrow('f4', 'stock', 'notice', 'No'),
    arrow('f5', 'charge', 'ship'),
    arrow('f6', 'ship', 'end'),
    arrow('f7', 'notice', 'end'),
    { op: 'arrange' },
  ]);
  await check(flow);
  await save(flow, 'diagrams/images/flowchart-order-approval.png');

  const messy = await create('Event intake');
  await apply(messy, [
    { op: 'upsert_node', id: 'a', service: 'lambda', name: 'Lambda', x: 0, y: 0 },
    { op: 'upsert_node', id: 'b', service: 'lambda', name: 'Lambda', x: 60, y: 40 },
    { op: 'upsert_node', id: 'q', service: 'sqs', name: 'Queue', x: 90, y: 20 },
    { op: 'upsert_node', id: 't', service: 'dynamodb', name: 'Table', x: 600, y: 400 },
    { op: 'upsert_edge', id: 'r1', source: 'a', target: 'q', verb: 'sends to' },
    { op: 'upsert_edge', id: 'r2', source: 'q', target: 'b', verb: 'handled by' },
  ]);
  await save(messy, 'quality/images/readability-before.png');
  await check(messy);
  await apply(messy, [
    { op: 'upsert_node', id: 'a', name: 'Accept events' },
    { op: 'upsert_node', id: 'b', name: 'Process events' },
    { op: 'upsert_node', id: 'q', name: 'Event queue' },
    { op: 'upsert_node', id: 't', name: 'Event store' },
    { op: 'upsert_edge', id: 'r3', source: 'b', target: 't', verb: 'writes to' },
    { op: 'arrange' },
  ]);
  await check(messy);
  await save(messy, 'quality/images/readability-after.png');

  const exports = await create('Photo uploads');
  await apply(exports, photoUploads);
  await save(exports, 'sharing/images/photo-uploads.svg', 'svg', null);
  await save(exports, 'sharing/images/photo-uploads.excalidraw', 'excalidraw', null);
  await save(exports, 'sharing/images/background-transparent.png', 'png', null);
  await save(exports, 'sharing/images/background-white.png', 'png', '#ffffff');
  await save(exports, 'sharing/images/background-tinted.png', 'png', '#eef3fb');
} finally {
  await client.close();
  await rm(dataDir, { recursive: true, force: true });
}
