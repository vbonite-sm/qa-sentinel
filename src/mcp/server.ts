/* eslint-disable @typescript-eslint/no-explicit-any */
import * as tools from './tools'

/**
 * Sentinel MCP server. Exposes the agent-native tools over the Model Context
 * Protocol stdio transport so AI agents (Claude, Copilot, Cursor) can call
 * Sentinel as a verification layer.
 *
 * The MCP SDK is an OPTIONAL dependency, loaded lazily via a non-literal
 * specifier so neither `tsc` nor `npm install` of the core package requires it.
 * If it is not installed, we print install guidance and exit non-zero.
 */
export async function startMcpServer(root = process.cwd()): Promise<void> {
  const mcpModulePath = '@modelcontextprotocol/sdk/server/mcp.js'
  const stdioModulePath = '@modelcontextprotocol/sdk/server/stdio.js'

  let McpServer: any
  let StdioServerTransport: any
  try {
    McpServer = (await import(mcpModulePath)).McpServer
    StdioServerTransport = (await import(stdioModulePath)).StdioServerTransport
  } catch {
    process.stderr.write(
      'qa-sentinel: the MCP server needs the optional dependency "@modelcontextprotocol/sdk".\n' +
        'Install it with: npm install @modelcontextprotocol/sdk\n'
    )
    process.exitCode = 1
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require('../../package.json') as { version: string }
  const server = new McpServer({ name: 'qa-sentinel', version: pkg.version })

  const asText = (data: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  })

  const register = (name: string, description: string, handler: () => unknown): void => {
    // Support both the current registerTool() and the legacy tool() signatures.
    if (typeof server.registerTool === 'function') {
      server.registerTool(name, { description, inputSchema: {} }, async () => asText(handler()))
    } else {
      server.tool(name, description, async () => asText(handler()))
    }
  }

  register('get_last_run', 'Summary of the most recent Sentinel test run', () => tools.getLastRun(root))
  register('diagnose_failure', 'Heuristic root-cause diagnosis of the last run', () => tools.diagnoseFailures(root))
  register('get_flaky_tests', 'Tests flagged flaky or unstable in the last run', () => tools.getFlakyTests(root))
  register('suggest_heal', 'Pending self-healing selector suggestions', () => tools.suggestHeal(undefined, root))

  await server.connect(new StdioServerTransport())
}
