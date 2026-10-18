/**
 * PROJECT NEXUS - Silent Ollama Semantic Search Engine
 * Runs completely in the background without user chat UI.
 * Expands natural language queries into semantic keywords and file concepts
 * (e.g., "baza w pythonie" -> ["sqlite", "postgresql", "db_connect", "orm", "cursor", "alchemy"])
 * if local Ollama (localhost:11434) is running, or falls back transparently.
 */
const http = require('node:http');

class OllamaSemanticEngine {
  static cachedAvailability = null;
  static lastChecked = 0;

  /**
   * Fast 150ms check if local Ollama daemon is active.
   */
  static isOllamaRunning() {
    const now = Date.now();
    if (this.cachedAvailability !== null && now - this.lastChecked < 30000) {
      return Promise.resolve(this.cachedAvailability);
    }

    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 250 }, (res) => {
        const isOk = res.statusCode === 200;
        this.cachedAvailability = isOk;
        this.lastChecked = now;
        resolve(isOk);
      });
      req.on('error', () => {
        this.cachedAvailability = false;
        this.lastChecked = now;
        resolve(false);
      });
      req.on('timeout', () => {
        req.destroy();
        this.cachedAvailability = false;
        this.lastChecked = now;
        resolve(false);
      });
    });
  }

  /**
   * Silently expand a search query using Ollama if running.
   * If not running, returns the query terms directly.
   */
  static async expandSemanticQuery(query) {
    if (!query || query.length < 3) return [query.toLowerCase()];

    const isRunning = await this.isOllamaRunning();
    if (!isRunning) {
      return query.toLowerCase().split(/\s+/).filter(Boolean);
    }

    try {
      // Ask Ollama for 5-8 related keywords/extensions/file types
      const prompt = `Return ONLY a comma-separated list of 5-8 technical file names, extensions, or keywords related to: "${query}". No markdown, no conversation.`;
      const postData = JSON.stringify({
        model: 'qwen2.5:1.5b', // or any installed default
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 40
        }
      });

      const expandedTerms = await new Promise((resolve) => {
        const req = http.request('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 1000
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              const responseText = data.response || '';
              const tokens = responseText
                .toLowerCase()
                .split(/[,;\n]/)
                .map(t => t.trim().replace(/^[^a-z0-9_.]+|[^a-z0-9_.]+$/g, ''))
                .filter(t => t.length > 1);
              resolve(tokens);
            } catch (_) {
              resolve([]);
            }
          });
        });

        req.on('error', () => resolve([]));
        req.on('timeout', () => {
          req.destroy();
          resolve([]);
        });
        req.write(postData);
        req.end();
      });

      const baseTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const unique = Array.from(new Set([...baseTerms, ...expandedTerms]));
      return unique;
    } catch (_) {
      return query.toLowerCase().split(/\s+/).filter(Boolean);
    }
  }
}

module.exports = { OllamaSemanticEngine };
