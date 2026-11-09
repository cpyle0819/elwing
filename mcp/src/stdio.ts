#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineCatalogRoot } from './assets.js';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { LocalDiskStore } from './local-store.js';
import { localOwner } from './owner.js';
import { createExporter } from './render.js';
import { buildRouter } from './tools.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write(
    'Usage: elwing-mcp [--data-dir PATH]\nRuns a single-user MCP server over stdio. ELWING_DATA_DIR also sets the data folder.\n',
  );
} else {
  try {
    if (args.length && (args.length !== 2 || args[0] !== '--data-dir' || !args[1]))
      throw Error('Usage: elwing-mcp [--data-dir PATH]');
    const services = JSON.parse(readFileSync(join(engineCatalogRoot(), 'services.json'), 'utf8'));
    const store = new LocalDiskStore({
      directory: args[1],
      serviceIds: services.map((service: { id: string }) => service.id),
    });
    await store.initialize();
    const router = buildRouter(localOwner(), {
      store,
      exporter: createExporter(),
      saveExport: store.saveExport.bind(store),
    });
    await router.connect(new StdioServerTransport());
  } catch (error: any) {
    process.stderr.write(`Elwing could not start: ${error.message}\n`);
    process.exitCode = 1;
  }
}
