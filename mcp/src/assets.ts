import { createRequire } from 'node:module';
import { dirname } from 'node:path';
export function engineCatalogRoot() {
  return dirname(createRequire(import.meta.url).resolve('elwing-diagram-engine/services.json'));
}
