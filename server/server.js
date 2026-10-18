/**
 * PROJECT NEXUS - ESM Server Entrypoint
 * Bridges ES Module execution to the active server.cjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./server.cjs');
