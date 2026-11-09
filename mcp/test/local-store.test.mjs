import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, symlink, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { LocalDiskStore, defaultDataDir } from '../dist/local-store.js';
import { localFixture, services } from './local-fixture.mjs';
import { LIMITS, digest } from '../dist/store-rules.js';

test('default folders and override precedence', () => {
  assert.equal(defaultDataDir({}, 'linux', '/home/test'), '/home/test/.local/share/elwing');
  assert.equal(defaultDataDir({ XDG_DATA_HOME: '/data' }, 'linux', '/home/test'), '/data/elwing');
  assert.equal(
    defaultDataDir({}, 'darwin', '/Users/test'),
    '/Users/test/Library/Application Support/Elwing',
  );
  assert.equal(
    defaultDataDir({ ELWING_DATA_DIR: '/override' }, 'linux', '/home/test'),
    '/override',
  );
  assert.match(
    defaultDataDir({ LOCALAPPDATA: '/appdata' }, 'win32', '/home/test'),
    /appdata.*Elwing$/,
  );
});
test('restart preserves documents and receipts; deletion keeps exports', async (t) => {
  const { store, owner, directory } = await localFixture(t);
  const args = { title: '../../Safe title', mutationId: randomUUID() };
  const made = await store.create(owner, args);
  const record = await store.get(owner, made.diagramId);
  const file = await store.saveExport(record, 'svg', Buffer.from('<svg/>').toString('base64'), '');
  assert.equal(file, join(directory, 'exports', made.diagramId, 'Safe-title-r1.svg'));
  const reopened = new LocalDiskStore({ directory, serviceIds: services.map((s) => s.id) });
  assert.deepEqual(await reopened.get(owner, made.diagramId), record);
  assert.deepEqual(await reopened.create(owner, args), made);
  await reopened.delete(owner, {
    diagramId: made.diagramId,
    expectedRevision: 1,
    mutationId: randomUUID(),
  });
  assert.equal(await readFile(file, 'utf8'), '<svg/>');
  assert.deepEqual(await reopened.create(owner, args), made);
  if (process.platform !== 'win32') {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  }
});
test('replays an interrupted transaction before reads and sweeps temporary files only on startup', async (t) => {
  const { store, owner, directory } = await localFixture(t);
  const made = await store.create(owner, { title: 'Before', mutationId: randomUUID() });
  const record = await store.get(owner, made.diagramId);
  const { document, ...metadata } = record;
  const pending = [
    {
      path: `diagrams/${made.diagramId}/meta.json`,
      value: { ...metadata, title: 'After', revision: 2 },
    },
    { path: `diagrams/${made.diagramId}/diagram.json`, value: { ...document, title: 'After' } },
  ];
  await writeFile(join(directory, 'transaction.json'), JSON.stringify(pending));
  const temporary = join(directory, `counter.json.${randomUUID()}.tmp`);
  await writeFile(temporary, 'partial');
  assert.equal((await store.get(owner, made.diagramId)).title, 'After');
  assert.equal((await store.get(owner, made.diagramId)).document.title, 'After');
  await access(temporary);
  await assert.rejects(access(join(directory, 'transaction.json')));
  const reopened = new LocalDiskStore({ directory, serviceIds: services.map((s) => s.id) });
  await reopened.initialize();
  await assert.rejects(access(temporary));
});
test('refuses incompatible versions, unsafe journals and symlinks', async (t) => {
  const { store, owner, directory } = await localFixture(t);
  await writeFile(join(directory, 'store.json'), '{"format":2}');
  await assert.rejects(store.list(owner), /Unsupported data folder format/);
  await writeFile(join(directory, 'store.json'), '{"format":1}');
  await writeFile(join(directory, 'transaction.json'), '[{"path":"../escape","value":1}]');
  await assert.rejects(store.list(owner), /Invalid local transaction/);
  await writeFile(join(directory, 'transaction.json'), '[]');
  await symlink(join(directory, 'store.json'), join(directory, 'exports', 'link'));
  const reopened = new LocalDiskStore({ directory, serviceIds: [] });
  await assert.rejects(reopened.initialize(), /symbolic links/);
});
test('listing and batch deletion ignore unrelated files and directories before pagination', async (t) => {
  const { store, owner, directory } = await localFixture(t);
  const diagrams = await Promise.all(
    ['First', 'Second'].map((title) => store.create(owner, { title, mutationId: randomUUID() })),
  );
  await writeFile(join(directory, 'diagrams', '.DS_Store'), 'Finder metadata');
  await writeFile(join(directory, 'diagrams', randomUUID()), 'Not a diagram directory');
  await mkdir(join(directory, 'diagrams', 'backup'));
  await mkdir(join(directory, 'diagrams', '00000000-0000-0000-0000-000000000000'));
  const first = await store.list(owner, 1);
  const second = await store.list(owner, 1, first.nextCursor);
  assert.deepEqual(
    [...first.items, ...second.items].map((item) => item.diagramId),
    diagrams.map((item) => item.diagramId).sort(),
  );
  assert.deepEqual((await store.list(owner, 1, second.nextCursor)).items, []);
  const result = await store.deleteMany(owner, {
    diagrams: [...first.items, ...second.items].map(({ diagramId, revision }) => ({
      diagramId,
      expectedRevision: revision,
    })),
    mutationId: randomUUID(),
  });
  assert.equal(result.deletedCount, 2);
  assert.deepEqual((await store.list(owner)).items, []);
});
test('startup deletes expired receipts and preserves unexpired deletion replay and exports', async (t) => {
  let now = Date.parse('2026-01-01T00:00:00Z');
  const { store, owner, directory } = await localFixture(t, { now: () => now });
  const made = await store.create(owner, { title: 'Example', mutationId: randomUUID() });
  const exported = await store.saveExport(
    await store.get(owner, made.diagramId),
    'svg',
    Buffer.from('<svg/>').toString('base64'),
    '',
  );
  now += 1000;
  const args = { diagramId: made.diagramId, expectedRevision: 1, mutationId: randomUUID() };
  const deleted = await store.delete(owner, args);
  now += LIMITS.receiptSeconds * 1000 - 1000;
  const reopened = new LocalDiskStore({ directory, serviceIds: [], now: () => now });
  await reopened.initialize();
  assert.equal((await readdir(join(directory, 'receipts'))).length, 1);
  assert.deepEqual(await reopened.delete(owner, args), deleted);
  assert.equal(await readFile(exported, 'utf8'), '<svg/>');
});
test('a running server periodically removes expired receipts without sweeping export history', async (t) => {
  let now = Date.parse('2026-01-01T00:00:00Z');
  const { store, owner, directory } = await localFixture(t, { now: () => now });
  const args = { title: 'Example', mutationId: randomUUID() };
  const made = await store.create(owner, args);
  const receipt = join(
    directory,
    'receipts',
    `${digest(`RECEIPT#CREATE#${args.mutationId}`)}.json`,
  );
  const temporary = join(directory, 'exports', `example.svg.${randomUUID()}.tmp`);
  await writeFile(temporary, 'partial export');
  now += LIMITS.receiptSeconds * 1000;
  assert.equal((await store.get(owner, made.diagramId)).title, 'Example');
  await assert.rejects(access(receipt), { code: 'ENOENT' });
  await access(temporary);
  assert.notEqual((await store.create(owner, args)).diagramId, made.diagramId);
  assert.equal((await readdir(join(directory, 'receipts'))).length, 1);
});
test('independent processes serialize identical mutations and recover a dead owner', async (t) => {
  const { store, owner, directory } = await localFixture(t);
  // Obtain an exited PID, rather than assuming a high PID is unused.
  const exited = spawn(process.execPath, ['-e', '']);
  await once(exited, 'exit');
  await mkdir(join(directory, '.lock'));
  await writeFile(
    join(directory, '.lock', 'owner.json'),
    JSON.stringify({ pid: exited.pid, timestamp: 1 }),
  );
  assert.equal((await store.list(owner)).items.length, 0);
  const mutationId = randomUUID();
  const source = `
    import { LocalDiskStore } from ${JSON.stringify(new URL('../dist/local-store.js', import.meta.url).href)};
    import { localOwner } from ${JSON.stringify(new URL('../dist/owner.js', import.meta.url).href)};
    const store = new LocalDiskStore({ directory: process.argv[1], serviceIds: [] });
    console.log(JSON.stringify(await store.create(localOwner(), {title: 'Concurrent', mutationId: process.argv[2]})));
  `;
  const run = async () => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', source, directory, mutationId],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '',
      errors = '';
    child.stdout.on('data', (bytes) => (output += bytes));
    child.stderr.on('data', (bytes) => (errors += bytes));
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, errors);
    return JSON.parse(output);
  };
  const results = await Promise.all(Array.from({ length: 4 }, run));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal((await store.list(owner)).items.length, 1);
});
