import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FORK_NAME, PACKAGE_DIR, packageDir, readManifest, REGISTRY, REPOSITORY } from './fork.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = args.find(arg => arg !== '--dry-run');

const manifestPath = path.join(packageDir, 'package.json');
const { source, manifest } = readManifest();

if (/^(.+)-fork\.\d+$/.exec(version ?? '')?.[1] !== manifest.version) {
  throw new Error(`${version} is not ${manifest.version}-fork.N`);
}

const spec = `${FORK_NAME}@${version}`;
const existing = spawnSync('npm', ['view', spec, 'version', '--registry', REGISTRY], { encoding: 'utf8' });
if (existing.status === 0 && existing.stdout.trim() !== '') {
  console.log(`${spec} skipped, already published`);
  process.exit(0);
}

const forked = {
  ...manifest,
  name: FORK_NAME,
  version,
  repository: { type: 'git', url: REPOSITORY, directory: PACKAGE_DIR },
  publishConfig: { registry: REGISTRY },
};

const destination = mkdtempSync(path.join(tmpdir(), 'fork-publish-'));
writeFileSync(manifestPath, `${JSON.stringify(forked, null, 2)}\n`);
let tarball: string;
try {
  const packed = execFileSync('pnpm', ['pack', '--json', '--pack-destination', destination], {
    cwd: packageDir,
    encoding: 'utf8',
  });
  tarball = JSON.parse(packed).filename;
} finally {
  writeFileSync(manifestPath, source);
}

execFileSync(
  'pnpm',
  ['publish', tarball, '--registry', REGISTRY, '--tag', 'latest', '--no-git-checks', ...(dryRun ? ['--dry-run'] : [])],
  { stdio: 'inherit' },
);
console.log(`${spec} ${dryRun ? 'packed, nothing published' : 'published'}`);
