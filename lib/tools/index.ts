/**
 * Tool registry for Origen Chat agents.
 *
 * Add new tools here — each tool gets its own file in this directory.
 * The index re-exports a `createTools()` function that the agent config uses.
 *
 * Tool-use support varies by model. Call `createTools()` only when the
 * selected model actually supports function/tool calling.
 */

export { createWikipediaTool } from "./wikipedia";

import type { OrigenTool } from "@moikapy/origen";
import { createWikipediaTool } from "./wikipedia";

/**
 * Build the full tool array for models that support tool use.
 * Returns an empty array for models that don't.
 */
export function createTools(supportsTools: boolean): OrigenTool[] {
  if (!supportsTools) return [];
  return [createWikipediaTool()];
}