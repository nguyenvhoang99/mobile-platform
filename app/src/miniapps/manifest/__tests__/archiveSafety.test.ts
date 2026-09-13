import { validateArchiveEntries } from '../archiveSafety';

describe('validateArchiveEntries', () => {
  it('accepts safe entries', () => {
    expect(
      validateArchiveEntries([
        { path: 'index.html', size: 2000, compressedSize: 800 },
        { path: 'app.js', size: 50000, compressedSize: 15000 },
      ]),
    ).toEqual({ ok: true });
  });

  it('rejects absolute path', () => {
    const r = validateArchiveEntries([{ path: '/etc/passwd', size: 10, compressedSize: 10 }]);
    expect(r.ok).toBe(false);
  });

  it('rejects traversal', () => {
    const r = validateArchiveEntries([{ path: '../evil.js', size: 10, compressedSize: 10 }]);
    expect(r.ok).toBe(false);
  });

  it('rejects symlink', () => {
    const r = validateArchiveEntries([{ path: 'link', size: 0, compressedSize: 0, isSymlink: true }]);
    expect(r.ok).toBe(false);
  });

  it('rejects zip bomb ratio', () => {
    const r = validateArchiveEntries([{ path: 'bomb', size: 100 * 1024 * 1024, compressedSize: 1024 }]);
    expect(r.ok).toBe(false);
  });
});
