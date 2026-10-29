import { execFileSync } from 'node:child_process';

import { readManifest, TAG_PREFIX } from './fork.ts';

const FORK_TAG = new RegExp(`^refs/tags/${TAG_PREFIX}.+-fork\\.(\\d+)$`);

const numbers = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin', `refs/tags/${TAG_PREFIX}*-fork.*`], {
  encoding: 'utf8',
})
  .split('\n')
  .map(line => FORK_TAG.exec(line.split('\t')[1] ?? '')?.[1])
  .filter((n): n is string => n !== undefined)
  .map(Number);

console.log(`${readManifest().manifest.version}-fork.${Math.max(0, ...numbers) + 1}`);
