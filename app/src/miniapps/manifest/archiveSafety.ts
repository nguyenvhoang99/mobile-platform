/**
 * Archive-entry safety — validate before writing any package bytes.
 * Rejects traversal, absolute paths, symlinks, non-regular files,
 * implausible expansion ratios. Pure, no I/O.
 */

export type ArchiveEntry = {
  path: string;
  size: number; // declared uncompressed size
  compressedSize: number;
  isSymlink?: boolean;
  isDirectory?: boolean;
};

export type ArchiveSafetyResult =
  | { ok: true }
  | { ok: false; reason: string; entry: string };

const MAX_EXPANSION_RATIO = 100; // e.g. 10KB → 1MB is suspicious
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file (admission ceiling provisional)
const MAX_TOTAL_FILES = 500;

export function validateArchiveEntries(
  entries: readonly ArchiveEntry[],
  opts: { maxFiles?: number; maxSingleBytes?: number } = {},
): ArchiveSafetyResult {
  const maxFiles = opts.maxFiles ?? MAX_TOTAL_FILES;
  const maxSingle = opts.maxSingleBytes ?? MAX_SINGLE_FILE_BYTES;

  if (entries.length > maxFiles) {
    return { ok: false, reason: `too many files: ${entries.length} > ${maxFiles}`, entry: '' };
  }

  for (const e of entries) {
    const p = e.path;

    // Reject absolute paths
    if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:\\/.test(p)) {
      return { ok: false, reason: 'absolute path', entry: p };
    }
    // Reject traversal
    if (p.split('/').includes('..') || p.includes('\0')) {
      return { ok: false, reason: 'path traversal (.. or null byte)', entry: p };
    }
    // Reject symlinks
    if (e.isSymlink) {
      return { ok: false, reason: 'symlink not allowed', entry: p };
    }
    // Non-regular files: directories are ok as entries but not as content files
    // (caller decides); we only flag if an entry claims to be something odd.
    if (p.endsWith('/') && e.size > 0) {
      return { ok: false, reason: 'directory entry must have zero size', entry: p };
    }

    // Implausible expansion ratio (zip bomb)
    if (e.compressedSize > 0 && e.size / e.compressedSize > MAX_EXPANSION_RATIO) {
      return { ok: false, reason: `expansion ratio ${Math.round(e.size / e.compressedSize)} > ${MAX_EXPANSION_RATIO}`, entry: p };
    }

    if (e.size > maxSingle) {
      return { ok: false, reason: `single file too large: ${e.size} > ${maxSingle}`, entry: p };
    }

    // Non-regular: empty path
    if (p.trim() === '') {
      return { ok: false, reason: 'empty path', entry: p };
    }
  }

  return { ok: true };
}
