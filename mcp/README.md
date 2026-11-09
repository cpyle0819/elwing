# Local MCP server

This package runs Elwing as one local user over stdio. It needs no AWS
credentials or sign-in. The shared tool handlers use the `DiagramStorage`
interface; `LocalDiskStore` stores documents, metadata, mutation receipts and
exports in a configurable local folder.

From the repository root:

```sh
npm --prefix engine ci --ignore-scripts
npm --prefix mcp ci --ignore-scripts
npm --prefix mcp run build
node mcp/dist/stdio.js --data-dir /absolute/path/to/diagrams
```

The process serves MCP messages, so normally an MCP client starts it:

```json
{
  "mcpServers": {
    "elwing": {
      "command": "node",
      "args": ["/absolute/path/to/elwing/mcp/dist/stdio.js"],
      "env": { "ELWING_DATA_DIR": "/absolute/path/to/diagrams" }
    }
  }
}
```

The flag overrides the environment variable. Without either, the server uses
the OS data directory (`~/.local/share/elwing` on Linux, respecting
`XDG_DATA_HOME`; `~/Library/Application Support/Elwing` on macOS; and
`%LOCALAPPDATA%\Elwing` on Windows).

`npm --prefix mcp test` runs the shared storage contract, filesystem recovery,
concurrency and stdio tests. The contract suite in `test/storage-contract.mjs`
can be applied to another implementation by providing a fixture that returns
`{store, owner}` and accepts injected `now` and `maxDiagrams` options.

All operations take a folder lock so reads cannot see a partially applied
transaction. A durable journal completes interrupted writes on the next
operation. Use a local filesystem, stop servers before backing up or editing
state files, and keep the whole folder together. Export files survive diagram
deletion. Linux behavior is tested; native macOS and Windows checks remain
future validation.
