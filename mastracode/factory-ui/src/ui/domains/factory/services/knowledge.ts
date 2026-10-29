/**
 * Browser-side helpers for a Factory project's Knowledge (read-only).
 *
 * Talks to `/web/factory/projects/:id/knowledge/*` (`mastracode/factory/src/routes/knowledge.ts`), which
 * reads the page store as the project's org and project scopes: the member sees org and project pages,
 * never another project's or a session's.
 */
import type {
  KnowledgeExplorerGraph,
  KnowledgeExplorerPageDetail,
} from '@mastra/playground-ui/domains/knowledge/components/KnowledgePageExplorer';
import type { KnowledgePagePayload } from '@mastra/playground-ui/domains/knowledge/pageTypes';

import { requestJson } from './request';

export interface KnowledgeSearchPayload {
  results: Array<{ page: KnowledgePagePayload }>;
}

function knowledgeBase(baseUrl: string, factoryProjectId: string): string {
  return `${baseUrl}/web/factory/projects/${encodeURIComponent(factoryProjectId)}/knowledge`;
}

export function fetchKnowledgeGraph(
  baseUrl: string,
  factoryProjectId: string,
  signal?: AbortSignal,
): Promise<KnowledgeExplorerGraph> {
  return requestJson(`${knowledgeBase(baseUrl, factoryProjectId)}/graph`, { signal });
}

export function fetchKnowledgePage(
  baseUrl: string,
  factoryProjectId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<KnowledgeExplorerPageDetail> {
  return requestJson(`${knowledgeBase(baseUrl, factoryProjectId)}/pages/${encodeURIComponent(pageId)}`, { signal });
}

export function fetchKnowledgeSearch(
  baseUrl: string,
  factoryProjectId: string,
  query: string,
  signal?: AbortSignal,
): Promise<KnowledgeSearchPayload> {
  return requestJson(`${knowledgeBase(baseUrl, factoryProjectId)}/search?${new URLSearchParams({ q: query })}`, {
    signal,
  });
}
