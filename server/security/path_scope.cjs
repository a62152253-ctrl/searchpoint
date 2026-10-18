const fs = require('node:fs');
const path = require('node:path');

function isPathWithin(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolvePathInRoots(userPath, roots, { rejectRoot = false } = {}) {
  if (typeof userPath !== 'string' || !userPath.trim()) {
    throw new Error('A non-empty filesystem path is required.');
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('No active filesystem root is available.');
  }

  const candidate = path.resolve(userPath);
  let resolvedCandidate = candidate;
  const entryExists = (entryPath) => {
    try {
      fs.lstatSync(entryPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
      throw err;
    }
  };
  if (entryExists(candidate)) {
    resolvedCandidate = fs.realpathSync.native(candidate);
  } else {
    let ancestor = candidate;
    const missingSegments = [];
    while (!entryExists(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        throw new Error('The filesystem path has no existing parent.');
      }
      missingSegments.unshift(path.basename(ancestor));
      ancestor = parent;
    }
    resolvedCandidate = path.resolve(fs.realpathSync.native(ancestor), ...missingSegments);
  }

  const allowedRoot = roots.find((root) => {
    if (typeof root !== 'string' || !root.trim() || !fs.existsSync(root)) return false;
    const resolvedRoot = fs.realpathSync.native(path.resolve(root));
    return isPathWithin(resolvedRoot, resolvedCandidate);
  });
  if (!allowedRoot) {
    throw new Error('The requested path is outside the active indexed folders.');
  }

  const resolvedRoot = fs.realpathSync.native(path.resolve(allowedRoot));
  if (rejectRoot && path.relative(resolvedRoot, resolvedCandidate) === '') {
    throw new Error('Operations on an active root folder are not allowed.');
  }

  return resolvedCandidate;
}

module.exports = { isPathWithin, resolvePathInRoots };
