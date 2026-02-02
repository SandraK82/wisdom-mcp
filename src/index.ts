#!/usr/bin/env node

import { startStdioServer } from './server.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { mode: 'stdio' | 'http'; port?: number } {
  const args = process.argv.slice(2);

  if (args.includes('--http')) {
    const portIndex = args.indexOf('--port');
    const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3000;
    return { mode: 'http', port };
  }

  // Default to stdio mode
  return { mode: 'stdio' };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { mode } = parseArgs();

  if (mode === 'http') {
    // HTTP mode will be implemented in Phase 8
    console.error('HTTP mode not yet implemented. Use --stdio (default) for now.');
    process.exit(1);
  }

  // Start stdio server
  await startStdioServer();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
