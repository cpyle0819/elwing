import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { LocalDiskStore } from '../dist/local-store.js';
import { localOwner } from '../dist/owner.js';

export const services = JSON.parse(
  await readFile(
    createRequire(import.meta.url).resolve('elwing-diagram-engine/services.json'),
    'utf8',
  ),
);
export async function localFixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'elwing-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new LocalDiskStore({
    directory,
    serviceIds: services.map((s) => s.id),
    ...options,
  });
  await store.initialize();
  return { store, directory, owner: localOwner() };
}
