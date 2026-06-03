#!/usr/bin/env node
import { startMcpServer } from '../mcp/server'

startMcpServer().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`qa-sentinel-mcp: ${message}\n`)
  process.exitCode = 1
})
