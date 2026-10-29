import type { KnowledgeGraphResponse, KnowledgePageResponse, KnowledgeSearchResponse } from '@mastra/client-js';
import { useMastraClient } from '@mastra/react';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';

const MIN_SEARCH_LENGTH = 2;

export function useKnowledgeInstances() {
  const client = useMastraClient();
  return useQuery({
    queryKey: ['knowledge', 'instances'],
    queryFn: async () => (await client.listKnowledge()).instances,
  });
}

/** The bounded page graph across every root scope; its pages also feed the tree. */
export function useKnowledgePageGraph(knowledgeKey: string | undefined) {
  const client = useMastraClient();
  return useQuery({
    queryKey: ['knowledge', knowledgeKey, 'graph'],
    queryFn: knowledgeKey
      ? async (): Promise<KnowledgeGraphResponse> => client.getKnowledge(knowledgeKey).graph()
      : skipToken,
  });
}

export function useKnowledgePage(knowledgeKey: string | undefined, pageId: string | null) {
  const client = useMastraClient();
  return useQuery({
    queryKey: ['knowledge', knowledgeKey, 'page', pageId],
    queryFn:
      knowledgeKey && pageId
        ? async (): Promise<KnowledgePageResponse> => client.getKnowledge(knowledgeKey).page(pageId)
        : skipToken,
  });
}

export function useKnowledgeSearch(knowledgeKey: string | undefined, query: string) {
  const client = useMastraClient();
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['knowledge', knowledgeKey, 'search', trimmed],
    queryFn:
      knowledgeKey && trimmed.length >= MIN_SEARCH_LENGTH
        ? async (): Promise<KnowledgeSearchResponse> => client.getKnowledge(knowledgeKey).search(trimmed)
        : skipToken,
    placeholderData: keepPreviousData,
  });
}
