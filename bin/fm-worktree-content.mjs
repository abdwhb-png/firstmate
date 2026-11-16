// Canonical working-content identity shared by MDD and demonstration reviews.
// Callers own administrative exclusions and external evidence references.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export function worktreeContent(worktree, administrative = new Set(), baseCommit) {
  const listing = spawnSync('git', ['-C', worktree, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (listing.status !== 0) throw Error('cannot enumerate reviewed working content');
  let names = listing.stdout, baseline;
  if (baseCommit) {
    const base = spawnSync('git', ['-C', worktree, 'ls-tree', '-rz', '--name-only', baseCommit], { encoding: 'utf8' });
    if (base.status !== 0) throw Error('cannot enumerate reviewed delivery base');
    names += base.stdout;
    baseline = new Set(base.stdout.split('\0').filter(Boolean));
  }
  return [...new Set(names.split('\0').filter(Boolean))].sort()
    .filter(file => !administrative.has(path.resolve(worktree, file))).map(file => {
      const full = path.join(worktree, file), stat = fs.lstatSync(full, { throwIfNoEntry: false });
      if (!stat) return baseline && !baseline.has(file) ? '' : `${file}\0deleted\n`;
      if (stat.isSymbolicLink()) return `${file}\0link:${fs.readlinkSync(full)}\n`;
      if (!stat.isFile()) throw Error(`review requires explicit handling of submodule or special path: ${file}`);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      return `${file}\0${stat.mode & 0o111}\0${digest}\n`;
    }).join('');
}
