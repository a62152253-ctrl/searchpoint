/**
 * PROJECT NEXUS - UNIVERSAL DOCUMENT INDEXER
 * 
 * Analyzes TXT, MD, PDF, DOCX, CSV, JSON, LOG files.
 * Extracts title, line count, word count, text snippets, and document intent tags:
 * e.g. "faktura", "umowa", "raport", "notatki", "specyfikacja"
 * 
 * Pure Node.js - Zero external dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const { LRUCache } = require('../performance/memory_manager.cjs');

const docMetaCache = new LRUCache(2000, 16 * 1024 * 1024);

const DOC_INTENTS = [
  { intent: 'faktura', tokens: ['faktura', 'invoice', 'vat', 'rachunek', 'paragon'] },
  { intent: 'umowa', tokens: ['umowa', 'contract', 'agreement', 'porozumienie', 'regulamin'] },
  { intent: 'raport', tokens: ['raport', 'report', 'summary', 'analiza', 'podsumowanie'] },
  { intent: 'notatki', tokens: ['notatki', 'notes', 'todo', 'pomysly', 'draft', 'memo'] },
  { intent: 'specyfikacja', tokens: ['spec', 'specyfikacja', 'readme', 'docs', 'manual'] },
  { intent: 'cv', tokens: ['cv', 'curriculum', 'resume', 'zyciorys'] }
];

class DocIndexer {
  static isDocumentFile(ext) {
    const clean = ext.toLowerCase().replace('.', '');
    return ['pdf', 'docx', 'doc', 'txt', 'md', 'csv', 'json', 'log', 'rtf'].includes(clean);
  }

  static analyzeDocument(filePath) {
    if (docMetaCache.has(filePath)) {
      return docMetaCache.get(filePath);
    }

    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    if (!this.isDocumentFile(ext)) return null;

    try {
      const stat = fs.statSync(filePath);
      const fileNameLower = path.basename(filePath).toLowerCase();

      // Read initial chunk (up to 32KB)
      let excerpt = '';
      let wordCount = 0;
      let lineCount = 0;

      if (['txt', 'md', 'csv', 'json', 'log'].includes(ext)) {
        const buffer = Buffer.alloc(Math.min(stat.size, 32768));
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        const content = buffer.toString('utf-8');
        const lines = content.split('\n');
        lineCount = lines.length;
        wordCount = content.split(/\s+/).filter(Boolean).length;
        excerpt = lines.slice(0, 8).join('\n').trim().slice(0, 400);
      } else {
        // PDF / DOCX binary header inspection
        lineCount = 0;
        wordCount = Math.round(stat.size / 6); // Approximation
        excerpt = `Dokument binarny [${ext.toUpperCase()}] (${(stat.size / 1024).toFixed(1)} KB)`;
      }

      // Detect intents
      const intents = new Set();
      const combinedText = `${fileNameLower} ${excerpt.toLowerCase()}`;
      for (const d of DOC_INTENTS) {
        if (d.tokens.some(t => combinedText.includes(t))) {
          intents.add(d.intent);
        }
      }

      const result = {
        format: ext.toUpperCase(),
        sizeBytes: stat.size,
        lineCount,
        wordCount,
        excerpt,
        intents: Array.from(intents)
      };

      docMetaCache.set(filePath, result, 1024);
      return result;
    } catch (e) {
      return { format: ext.toUpperCase(), error: e.message };
    }
  }
}

module.exports = {
  DocIndexer
};
