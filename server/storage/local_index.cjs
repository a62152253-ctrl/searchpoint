/**
 * PROJECT NEXUS - HIGH-SPEED LOCAL INDEX & REPOSITORY
 * 
 * In-memory indexed storage with multi-key secondary indices:
 * - by extension (.png, .ts, .zip...)
 * - by category (DEV, MEDIA, DOCS...)
 * - by year
 * 
 * Fast atomic updates and snapshot persistence to disk.
 * Pure Node.js - Zero external dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');

class LocalIndex {
  constructor() {
    this.items = [];
    this.byId = new Map();
    this.byPath = new Map();
    this.byExt = new Map();
    this.byCategory = new Map();
    this.activePath = '';
  }

  setItems(newItems, activePath = '') {
    this.items = newItems;
    this.activePath = activePath;
    this.rebuildIndices();
  }

  appendBatch(batch) {
    for (const item of batch) {
      if (!this.byId.has(item.id)) {
        this.items.push(item);
        this.indexSingle(item);
      }
    }
  }

  clear() {
    this.items = [];
    this.byId.clear();
    this.byPath.clear();
    this.byExt.clear();
    this.byCategory.clear();
  }

  rebuildIndices() {
    this.byId.clear();
    this.byPath.clear();
    this.byExt.clear();
    this.byCategory.clear();

    for (const item of this.items) {
      this.indexSingle(item);
    }
  }

  indexSingle(item) {
    this.byId.set(item.id, item);
    this.byPath.set(item.path, item);

    const ext = (item.extension || '').toLowerCase();
    if (!this.byExt.has(ext)) this.byExt.set(ext, []);
    this.byExt.get(ext).push(item);

    const cat = (item.category || 'OTHER').toUpperCase();
    if (!this.byCategory.has(cat)) this.byCategory.set(cat, []);
    this.byCategory.get(cat).push(item);
  }

  getItemById(id) {
    return this.byId.get(id) || null;
  }

  getItemByPath(filePath) {
    return this.byPath.get(filePath) || null;
  }

  getItemsByExt(ext) {
    return this.byExt.get(ext.toLowerCase().replace('.', '')) || [];
  }

  getItemsByCategory(cat) {
    return this.byCategory.get(cat.toUpperCase()) || [];
  }

  removeByPath(filePath) {
    const item = this.byPath.get(filePath);
    if (!item) return false;
    this.items = this.items.filter(i => i.path !== filePath);
    this.byId.delete(item.id);
    this.byPath.delete(filePath);
    this.rebuildIndices();
    return true;
  }

  size() {
    return this.items.length;
  }

  saveSnapshot(snapshotPath) {
    try {
      const data = JSON.stringify({
        activePath: this.activePath,
        timestamp: Date.now(),
        count: this.items.length,
        items: this.items
      });
      fs.writeFileSync(snapshotPath, data, 'utf-8');
      return true;
    } catch (e) {
      return false;
    }
  }

  loadSnapshot(snapshotPath) {
    try {
      if (!fs.existsSync(snapshotPath)) return false;
      const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
      if (Array.isArray(data.items)) {
        this.setItems(data.items, data.activePath);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

module.exports = {
  LocalIndex
};
