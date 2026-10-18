/**
 * PROJECT NEXUS - LOW-LEVEL CODE & AST DEPENDENCY GRAPH PARSER
 * Zero external dependencies.
 * Analyzes source code files (.tsx, .ts, .jsx, .js, .py, .rs, .json, .html, .css),
 * extracts frameworks, dependencies, and relative asset import links (e.g. images linked to UI code).
 */

const fs = require('node:fs');
const path = require('node:path');

// Framework Signatures and Markers
const FRAMEWORK_SIGNATURES = [
  { name: 'React', patterns: [/from\s+['"]react['"]/, /import\s+React/, /useState|useEffect|useContext/] },
  { name: 'Next.js', patterns: [/from\s+['"]next\//, /getServerSideProps|getStaticProps/, /useRouter/] },
  { name: 'Vue.js', patterns: [/from\s+['"]vue['"]/, /defineComponent/, /<template>/] },
  { name: 'Tailwind CSS', patterns: [/@import\s+['"]tailwindcss['"]/, /@tailwind\s+base/, /className=['"][^'"]*bg-[^'"]*['"]/] },
  { name: 'Tauri Desktop', patterns: [/@tauri-apps\/api/, /tauri::Builder/] },
  { name: 'Electron', patterns: [/require\(['"]electron['"]\)/, /from\s+['"]electron['"]/] },
  { name: 'Express Backend', patterns: [/require\(['"]express['"]\)/, /from\s+['"]express['"]/, /app\.get\(|app\.post\(/] },
  { name: 'FastAPI (Python)', patterns: [/from\s+fastapi\s+import/, /FastAPI\(\)/] },
  { name: 'Rust Tokio/Actix', patterns: [/use\s+tokio::/, /#\[actix_web::main\]/, /use\s+actix_web::/] }
];

// Import & Asset Link Regex
const IMPORT_ASSET_REGEX = /(?:import\s+(?:[\w*\s{},]+)\s+from\s+['"]([^'"]+\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp4|webm|json|css|scss))['"]|require\(['"]([^'"]+\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp4|webm|json|css|scss))['"]|src=['"]([^'"]+\.(?:png|jpg|jpeg|webp|svg|gif|ico))['"]|url\(['"]?([^'")\s]+\.(?:png|jpg|jpeg|webp|svg|gif|ico))['"]?\))/gi;

class CodeParser {
  /**
   * Fast probe reading up to 32KB of source code
   */
  static async probeCode(filePath, maxBytes = 32768) {
    let fd = null;
    try {
      fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
      if (bytesRead === 0) {
        return { isCode: true, lines: 0, isEmpty: true };
      }
      const content = buffer.toString('utf-8', 0, bytesRead);
      return this.analyzeContent(content, filePath);
    } catch (err) {
      return { isCode: false, error: err.message };
    } finally {
      if (fd) {
        try { await fd.close(); } catch (e) {}
      }
    }
  }

  static analyzeContent(content, filePath) {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const lines = content.split('\n');
    const totalLines = lines.length;

    // 1. Detect Frameworks
    const detectedFrameworks = [];
    for (const fw of FRAMEWORK_SIGNATURES) {
      if (fw.patterns.some(p => p.test(content))) {
        detectedFrameworks.push(fw.name);
      }
    }

    // 2. Discover Linked Assets (Cross-file graph dependencies)
    const linkedAssetPaths = [];
    let match;
    const regex = new RegExp(IMPORT_ASSET_REGEX);
    while ((match = regex.exec(content)) !== null) {
      const assetRef = match[1] || match[2] || match[3] || match[4];
      if (assetRef) {
        linkedAssetPaths.push({
          rawRef: assetRef,
          resolvedCandidate: path.resolve(path.dirname(filePath), assetRef)
        });
      }
    }

    // 3. Detect Component & Export Names
    const exportedSymbols = [];
    const exportRegex = /(?:export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface)\s+([A-Z]\w*)|function\s+([A-Z]\w*)\s*\()/g;
    let expMatch;
    while ((expMatch = exportRegex.exec(content)) !== null) {
      const name = expMatch[1] || expMatch[2];
      if (name && !exportedSymbols.includes(name)) {
        exportedSymbols.push(name);
      }
    }

    // 4. Calculate Code Metrics
    let blankLines = 0;
    let commentLines = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) blankLines++;
      else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
        commentLines++;
      }
    }
    const codeLines = totalLines - blankLines - commentLines;

    return {
      isCode: true,
      language: ext,
      totalLines,
      codeLines,
      commentLines,
      blankLines,
      detectedFrameworks,
      exportedSymbols: exportedSymbols.slice(0, 10),
      linkedAssetCount: linkedAssetPaths.length,
      linkedAssets: linkedAssetPaths,
      isComponent: ext.includes('tsx') || ext.includes('jsx') || exportedSymbols.length > 0,
      classificationRecommendation: detectedFrameworks.length > 0 ? `${detectedFrameworks[0]} Source` : 'Generic Code'
    };
  }
}

module.exports = {
  CodeParser,
  FRAMEWORK_SIGNATURES
};
