/**
 * PROJECT NEXUS - ESM Scanner Bridge
 * Re-exports NexusScanner from scanner.cjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const scanner = require('./scanner.cjs');

export const NexusScanner = scanner.NexusScanner;
export default scanner;
