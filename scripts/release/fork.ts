import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REGISTRY = 'https://npm.pkg.github.com';
export const FORK_NAME = '@pattobrien/mastra-claude';
export const REPOSITORY = 'git+https://github.com/pattobrien/mastra.git';
export const PACKAGE_DIR = 'agent-sdks/claude';
export const TAG_PREFIX = 'mastra-claude@';

export const packageDir = fileURLToPath(new URL(`../../${PACKAGE_DIR}/`, import.meta.url));

export function readManifest(): { source: string; manifest: { version: string } & Record<string, unknown> } {
  const source = readFileSync(`${packageDir}package.json`, 'utf8');
  return { source, manifest: JSON.parse(source) };
}
