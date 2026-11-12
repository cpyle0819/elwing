import type { Owner } from './owner.js';
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  readOnly: boolean;
};
export type ToolProfile = {
  serverInfo: { name: string; title: string; version: string; description: string };
  instructions: string;
  guide: string;
  workflow: string;
  descriptions?: Record<string, string>;
  resourceDescriptions: Record<string, string>;
  promptDescription: string;
  extraTools?: { position: number; definition: ToolDefinition }[];
  destructiveTools?: string[];
  callExtra?: (name: string, owner: Owner, args: any) => Promise<any>;
};
