/**
 * PROJECT NEXUS - UNIVERSAL CODE & SYMBOL INDEXER
 * 
 * Extracts functions, classes, exports, comments, and semantic code keywords:
 * e.g. "ten kod od logowania gdzie miałem funkcję od recovery code"
 * 
 * Pure Node.js - Zero external dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const { LRUCache } = require('../performance/memory_manager.cjs');

// Code cache to prevent redundant disk I/O
const codeMetaCache = new LRUCache(3000, 32 * 1024 * 1024);

const LANG_MAP = {
  tsx: 'TypeScript (React)',
  ts: 'TypeScript',
  jsx: 'JavaScript (React)',
  js: 'JavaScript',
  cjs: 'Node.js CommonJS',
  mjs: 'Node.js ESModule',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  java: 'Java',
  php: 'PHP',
  rb: 'Ruby',
  swift: 'Swift',
  kt: 'Kotlin',
  sql: 'SQL Database',
  html: 'HTML Web',
  css: 'CSS Styles',
  scss: 'SCSS Styles',
  json: 'JSON Config',
  yaml: 'YAML Config',
  yml: 'YAML Config',
  sh: 'Shell Script',
  ps1: 'PowerShell Script',
  md: 'Markdown Docs'
};

class SyntaxIndexer {
  static getLanguage(ext) {
    const cleanExt = ext.toLowerCase().replace('.', '');
    return LANG_MAP[cleanExt] || 'Plik tekstowy';
  }

  static isCodeFile(ext) {
    const cleanExt = ext.toLowerCase().replace('.', '');
    return Boolean(LANG_MAP[cleanExt]);
  }

  /**
   * Deep scan of code file for symbols, functions, comments and tokens
   */
  static extractSymbols(filePath) {
    if (codeMetaCache.has(filePath)) {
      return codeMetaCache.get(filePath);
    }

    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    if (!this.isCodeFile(ext)) {
      return null;
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 2 * 1024 * 1024) { // Skip files > 2MB for fast indexing
        return { language: this.getLanguage(ext), isLarge: true };
      }

      // Read first 64KB for symbol analysis
      const buffer = Buffer.alloc(Math.min(stat.size, 65536));
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      const content = buffer.toString('utf-8');
      const lines = content.split('\n');

      const functions = [];
      const classes = [];
      const imports = [];
      const semanticKeywords = new Set();

      // RegExes for symbols across JS/TS/Py/Rust/Go/PHP
      const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+([a-zA-Z0-9_]+)|fn\s+([a-zA-Z0-9_]+)|func\s+([a-zA-Z0-9_]+))/g;
      const classRegex = /(?:class|struct|interface|type|enum)\s+([a-zA-Z0-9_$]+)/g;
      const importRegex = /(?:import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|use\s+([a-zA-Z0-9_:]+))/g;

      let match;
      while ((match = fnRegex.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3] || match[4] || match[5];
        if (name && !functions.includes(name)) functions.push(name);
      }

      while ((match = classRegex.exec(content)) !== null) {
        if (match[1] && !classes.includes(match[1])) classes.push(match[1]);
      }

      while ((match = importRegex.exec(content)) !== null) {
        const imp = match[1] || match[2] || match[3];
        if (imp && !imports.includes(imp)) imports.push(imp);
      }

      // Detect semantic intents: login, auth, recovery, database, token, password, jwt
      const lower = content.toLowerCase();
      const intentChecks = [
        ['login', 'auth', 'logowanie', 'uwierzytelnianie'],
        ['recovery', 'recovery code', 'odzyskiwanie', 'kod odzyskiwania'],
        ['password', 'haslo', 'passwd', 'reset-password'],
        ['jwt', 'token', 'session', 'bearer', 'cookie'],
        ['database', 'baza', 'sql', 'query', 'prisma', 'mongoose', 'postgres'],
        ['api', 'route', 'controller', 'handler', 'endpoint'],
        ['component', 'widget', 'modal', 'drawer', 'navbar'],
        ['test', 'spec', 'jest', 'vitest', 'unit-test']
      ];

      for (const [canonical, ...aliases] of intentChecks) {
        if (aliases.some(a => lower.includes(a)) || lower.includes(canonical)) {
          semanticKeywords.add(canonical);
        }
      }

      // Snippet preview (first non-empty 8 lines)
      const previewLines = lines.slice(0, 10).map((l, idx) => ({
        num: idx + 1,
        text: l.slice(0, 120)
      }));

      const result = {
        language: this.getLanguage(ext),
        ext,
        totalLines: lines.length,
        sizeBytes: stat.size,
        functions: functions.slice(0, 20),
        classes: classes.slice(0, 10),
        imports: imports.slice(0, 15),
        semanticKeywords: Array.from(semanticKeywords),
        previewSnippet: previewLines
      };

      codeMetaCache.set(filePath, result, 2048);
      return result;
    } catch (e) {
      return { language: this.getLanguage(ext), error: e.message };
    }
  }
}

module.exports = {
  SyntaxIndexer
};
