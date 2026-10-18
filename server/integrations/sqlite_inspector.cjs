/**
 * PROJECT NEXUS - Built-In Native SQLite Inspector
 * Uses Node 24 built-in `node:sqlite` (DatabaseSync) for 100% zero-dependency,
 * ultra-fast schema inspection, table listing, and row sampling.
 */
const fs = require('node:fs');
const path = require('node:path');

class SQLiteInspector {
  /**
   * Check if a file is a valid SQLite 3 database by reading its header magic bytes.
   */
  static isSQLiteFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return false;
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(16);
      try {
        fs.readSync(fd, buf, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }
      return buf.toString('utf-8').startsWith('SQLite format 3');
    } catch (_) {
      return false;
    }
  }

  /**
   * Safely inspect tables, schemas, and sample rows from an SQLite database.
   */
  static inspectDatabase(filePath, maxSampleRows = 5) {
    try {
      const resolved = path.resolve(filePath);
      if (!this.isSQLiteFile(resolved)) {
        return { isSqlite: false };
      }

      const { DatabaseSync } = require('node:sqlite');
      // Open in read-only mode
      const db = new DatabaseSync(resolved, { readOnly: true });

      const tables = [];
      let totalRecords = 0;

      try {
        // Fetch all user tables
        const tableRows = db.prepare(
          "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
        ).all();

        for (const t of tableRows) {
          let count = 0;
          let columns = [];
          let sampleData = [];

          try {
            // Table info (columns)
            const colRows = db.prepare(`PRAGMA table_info("${t.name.replace(/"/g, '""')}")`).all();
            columns = colRows.map(c => ({
              cid: c.cid,
              name: c.name,
              type: c.type || 'TEXT',
              notnull: !!c.notnull,
              pk: !!c.pk
            }));

            // Fast count
            const countRow = db.prepare(`SELECT COUNT(*) as c FROM "${t.name.replace(/"/g, '""')}"`).get();
            count = countRow ? Number(countRow.c) : 0;
            totalRecords += count;

            // Sample rows
            sampleData = db.prepare(`SELECT * FROM "${t.name.replace(/"/g, '""')}" LIMIT ${Math.min(maxSampleRows, 25)}`).all();
          } catch (_) {}

          tables.push({
            name: t.name,
            type: t.type,
            sql: t.sql,
            columns,
            rowCount: count,
            sampleData
          });
        }
      } finally {
        try { db.close(); } catch (_) {}
      }

      return {
        isSqlite: true,
        path: resolved,
        fileName: path.basename(resolved),
        tableCount: tables.length,
        totalRecords,
        tables
      };
    } catch (err) {
      return {
        isSqlite: false,
        error: err.message
      };
    }
  }
}

module.exports = { SQLiteInspector };
