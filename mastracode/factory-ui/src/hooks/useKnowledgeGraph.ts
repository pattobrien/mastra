/** React Query hooks for a Factory project's Knowledge page. */

import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';

import { useApiConfig } from '../api/config';
import { queryKeys } from '../api/keys';
import {
  fetchKnowledgeGraph,
  fetchKnowledgePage,
  fetchKnowledgeSearch,
} from '../ui/domains/factory/services/knowledge';
import { RequestError } from '../ui/domains/factory/services/request';

const MIN_SEARCH_LENGTH = 2;

/**
 * Live polling gate, so pages agents write show up while the page is open. Only a 404 is terminal;
 * transient errors keep polling. `paused` suspends polling while the user is interacting.
 */
export function knowledgeRefetchInterval(error: unknown, paused: boolean): number | false {
  if (error instanceof RequestError && error.status === 404) return false;
  if (paused) return false;
  return 5_000;
}

const notFound = (error: unknown) => error instanceof RequestError && error.status === 404;

export function useKnowledgeGraph(factoryProjectId: string | undefined, paused = false) {
  const { baseUrl } = useApiConfig();
  return useQuery({
    queryKey: queryKeys.knowledgeGraph(factoryProjectId),
    queryFn: factoryProjectId ? ({ signal }) => fetchKnowledgeGraph(baseUrl, factoryProjectId, signal) : skipToken,
    refetchInterval: query => knowledgeRefetchInterval(query.state.error, paused),
    retry: (failureCount, error) => !notFound(error) && failureCount < 2,
  });
}

export function useKnowledgePage(factoryProjectId: string | undefined, pageId: string) {
  const { baseUrl } = useApiConfig();
  return useQuery({
    queryKey: queryKeys.knowledgePage(factoryProjectId, pageId),
    queryFn: factoryProjectId
      ? ({ signal }) => fetchKnowledgePage(baseUrl, factoryProjectId, pageId, signal)
      : skipToken,
    retry: (failureCount, error) => !notFound(error) && failureCount < 2,
  });
}

export function useKnowledgeSearch(factoryProjectId: string | undefined, query: string) {
  const { baseUrl } = useApiConfig();
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.knowledgeSearch(factoryProjectId, trimmed),
    queryFn:
      factoryProjectId && trimmed.length >= MIN_SEARCH_LENGTH
        ? ({ signal }) => fetchKnowledgeSearch(baseUrl, factoryProjectId, trimmed, signal)
        : skipToken,
    placeholderData: keepPreviousData,
  });
}
