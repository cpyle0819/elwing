import { mkdir, open, readFile, rename, rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StoreError } from './store-rules.js';

export async function atomicWrite(path: string, value: string | Buffer) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  // Directory fsync makes the rename durable on filesystems that support it.
  try {
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error: any) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(error.code)) throw error;
  }
}
export async function json(path: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error: any) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error.code !== 'ESRCH';
  }
}
// The claim is complete before link/rename into the shared namespace. A recovery
// claim inside the dead lock prevents competing processes from reaping a new lock.
export async function withFolderLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, '.lock');
  const candidate = join(root, `.claim-${process.pid}-${randomUUID()}`);
  await mkdir(candidate, { mode: 0o700 });
  await atomicWrite(
    join(candidate, 'owner.json'),
    JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
  );
  const started = Date.now();
  let acquired = false;
  try {
    while (!acquired) {
      try {
        await rename(candidate, lock);
        acquired = true;
      } catch (error: any) {
        if (!['ENOTEMPTY', 'EEXIST', 'EPERM'].includes(error.code)) throw error;
        const owner = await json(join(lock, 'owner.json'));
        if (owner && Number.isInteger(owner.pid) && owner.pid > 0 && !alive(owner.pid)) {
          const recovery = join(lock, 'recovery');
          try {
            await mkdir(recovery, { mode: 0o700 });
            const current = await json(join(lock, 'owner.json'));
            if (
              !current ||
              current.pid !== owner.pid ||
              current.timestamp !== owner.timestamp ||
              alive(current.pid)
            ) {
              await rm(recovery, { recursive: true, force: true });
              continue;
            }
            // Keep the recovery marker inside the old directory while removing
            // its public name; a fresh owner can now safely claim .lock.
            const abandoned = join(root, `.abandoned-${randomUUID()}`);
            await rename(lock, abandoned);
            await rm(abandoned, { recursive: true, force: true });
          } catch (error: any) {
            if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error;
          }
        }
        if (Date.now() - started > 30000)
          throw new StoreError(
            'UNAVAILABLE',
            'Data folder is busy. Retry; if no server is running, remove the stale .lock directory.',
          );
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 30));
      }
    }
    return await action();
  } finally {
    if (acquired) await rm(lock, { recursive: true, force: true });
    else await rm(candidate, { recursive: true, force: true });
  }
}
export async function cleanTemps(root: string) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '.lock' || entry.name.startsWith('.claim-')) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.abandoned-')) await rm(path, { recursive: true, force: true });
      else await cleanTemps(path);
    } else if (/\.[0-9a-f-]{36}\.tmp$/.test(entry.name)) await rm(path, { force: true });
    else if (entry.isSymbolicLink())
      throw new StoreError('INVALID_ARGUMENT', 'Data folder must not contain symbolic links.');
  }
}
