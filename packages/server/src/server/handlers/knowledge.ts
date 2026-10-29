import {
  listKnowledgeTreeChildren,
  readKnowledgePage,
  readKnowledgePageActivity,
  readKnowledgePageGraph,
  searchKnowledgeExplorerPages,
} from '@mastra/core/knowledge';
import type { Mastra } from '@mastra/core/mastra';
import type { RequestContext } from '@mastra/core/request-context';
import type { KnowledgeStorage } from '@mastra/core/storage';
import { MastraFGAPermissions } from '../fga-permissions';
import { HTTPException } from '../http-exception';
import {
  knowledgeActivityQuerySchema,
  knowledgeActivityResponseSchema,
  knowledgeGraphQuerySchema,
  knowledgeGraphResponseSchema,
  knowledgePagePathParams,
  knowledgePageQuerySchema,
  knowledgePageResponseSchema,
  knowledgePathParams,
  knowledgeSearchQuerySchema,
  knowledgeSearchResponseSchema,
  knowledgeTreeQuerySchema,
  knowledgeTreeResponseSchema,
  listKnowledgeResponseSchema,
} from '../schemas/knowledge';
import { createRoute } from '../server-adapter/routes/route-builder';

import { handleError } from './error';

/**
 * Read-only browsing of Knowledge instances registered on Mastra, for Studio. Nothing here writes.
 *
 * These routes read as the instance owner: every page and note, whatever its scope. Who may call them at
 * all is decided by the app's auth: the path derives `knowledge:read` (`GET /knowledge/...`), and with FGA
 * configured each instance is filtered and gated by `knowledge:read` on that instance. Narrowing reads by a
 * caller's principals happens on agent runs, not here. The routes are opt-in (KNOWLEDGE_ROUTES); hosts with
 * their own scoping (Factory) do not mount them.
 */

async function accessibleInstances(
  mastra: Mastra,
  requestContext: RequestContext | undefined,
  entries: Array<{ id: string; key: string }>,
): Promise<Set<string>> {
  const fgaProvider = (mastra as any).getServer?.()?.fga;
  const user = requestContext?.get('user');
  if (!fgaProvider || !user || typeof user !== 'object' || entries.length === 0) {
    return new Set(entries.map(entry => entry.key));
  }
  const accessible: Array<{ id: string; key: string }> = await fgaProvider.filterAccessible(
    user,
    entries,
    'knowledge',
    MastraFGAPermissions.KNOWLEDGE_READ,
  );
  return new Set(accessible.map(entry => entry.key));
}

async function resolveStore(
  mastra: Mastra,
  requestContext: RequestContext | undefined,
  knowledgeKey: string | undefined,
): Promise<KnowledgeStorage> {
  const instance = knowledgeKey ? mastra.listKnowledge()[knowledgeKey] : undefined;
  if (!knowledgeKey || !instance)
    throw new HTTPException(404, { message: `Knowledge ${knowledgeKey ?? ''} not found` });

  // An instance the caller may not read looks the same as one that does not exist.
  const fgaProvider = (mastra as any).getServer?.()?.fga;
  const user = requestContext?.get('user');
  if (fgaProvider && user && typeof user === 'object') {
    const allowed = await fgaProvider.check(user, {
      resource: { type: 'knowledge', id: instance.id },
      permission: MastraFGAPermissions.KNOWLEDGE_READ,
    });
    if (!allowed) throw new HTTPException(404, { message: `Knowledge ${knowledgeKey} not found` });
  }
  return instance.getStorage();
}

export const LIST_KNOWLEDGE_ROUTE = createRoute({
  method: 'GET',
  path: '/knowledge',
  responseType: 'json',
  responseSchema: listKnowledgeResponseSchema,
  summary: 'List Knowledge instances',
  description:
    'Returns the Knowledge instances registered on this Mastra instance, by application key. The other Knowledge routes read every page as the instance owner; gate them with auth and, per instance, FGA `knowledge:read`.',
  tags: ['Knowledge'],
  requiresAuth: true,
  handler: async ({ mastra, requestContext }) => {
    try {
      const all = Object.entries(mastra.listKnowledge()).map(([key, instance]) => ({ key, id: instance.id }));
      const allowed = await accessibleInstances(mastra, requestContext, all);
      return { instances: all.filter(entry => allowed.has(entry.key)) };
    } catch (error) {
      return handleError(error, 'Error listing Knowledge instances');
    }
  },
});

export const GET_KNOWLEDGE_TREE_ROUTE = createRoute({
  method: 'GET',
  path: '/knowledge/:knowledgeKey/tree',
  responseType: 'json',
  pathParamSchema: knowledgePathParams,
  queryParamSchema: knowledgeTreeQuerySchema,
  responseSchema: knowledgeTreeResponseSchema,
  summary: 'List one level of the Knowledge page tree',
  description:
    'Without parentId, returns the root scopes. With parentId, returns its child scopes (first page only) then its child pages in order, paged with cursor.',
  tags: ['Knowledge'],
  requiresAuth: true,
  handler: async ({ mastra, requestContext, knowledgeKey, parentId, cursor, limit }) => {
    try {
      const store = await resolveStore(mastra, requestContext, knowledgeKey);
      return { ...(await listKnowledgeTreeChildren(store, { parentId: parentId ?? null, read: 'all', cursor, limit })) };
    } catch (error) {
      return handleError(error, 'Error reading Knowledge tree');
    }
  },
});

export const GET_KNOWLEDGE_PAGE_ROUTE = createRoute({
  method: 'GET',
  path: '/knowledge/:knowledgeKey/pages/:pageId',
  responseType: 'json',
  pathParamSchema: knowledgePagePathParams,
  queryParamSchema: knowledgePageQuerySchema,
  responseSchema: knowledgePageResponseSchema,
  summary: 'Get a Knowledge page',
  description:
    'Returns one page with its ancestors, a page of its notes, its pin, the pages its notes reference and notes elsewhere that mention it; 404 when it does not exist',
  tags: ['Knowledge'],
  requiresAuth: true,
  handler: async ({ mastra, requestContext, knowledgeKey, pageId, noteCursor, noteLimit }) => {
    try {
      const store = await resolveStore(mastra, requestContext, knowledgeKey);
      const view = await readKnowledgePage(store, { pageId, read: 'all', noteCursor, noteLimit });
      if (!view) throw new HTTPException(404, { message: 'Knowledge page not found' });
      return { ...view };
    } catch (error) {
      return handleError(error, 'Error reading Knowledge page');
    }
  },
});

export const GET_KNOWLEDGE_GRAPH_ROUTE = createRoute({
  method: 'GET',
  path: '/knowledge/:knowledgeKey/graph',
  responseType: 'json',
  pathParamSchema: knowledgePathParams,
  queryParamSchema: knowledgeGraphQuerySchema,
  responseSchema: knowledgeGraphResponseSchema,
  summary: 'Get a bounded Knowledge page graph',
  description:
    'Returns pages under rootId (or every root scope) breadth-first with parent and mention edges, bounded; truncated is true when a limit stopped it. 404 when rootId does not exist.',
  tags: ['Knowledge'],
  requiresAuth: true,
  handler: async ({ mastra, requestContext, knowledgeKey, rootId, maxPages }) => {
    try {
      const store = await resolveStore(mastra, requestContext, knowledgeKey);
      const graph = await readKnowledgePageGraph(store, {
        read: 'all',
        rootId: rootId ?? null,
        ...(maxPages ? { limits: { maxPages } } : {}),
      });
      if (!graph) throw new HTTPException(404, { message: 'Knowledge page not found' });
      return { ...graph };
    } catch (error) {
      return handleError(error, 'Error reading Knowledge graph');
    }
  },
});

export const SEARCH_KNOWLEDGE_ROUTE = createRoute({
  method: 'GET',
  path: '/knowledge/:knowledgeKey/search',
  responseType: 'json',
  pathParamSchema: knowledgePathParams,
  queryParamSchema: knowledgeSearchQuerySchema,
  responseSchema: knowledgeSearchResponseSchema,
  summary: 'Search Knowledge pages and notes',
  description: 'Returns pages whose name, synopsis or body, and notes whose text, match the query',
  tags: ['Knowledge'],
  requiresAuth: true,
  handler: async ({ mastra, requestContext, knowledgeKey, q, scopeId, limit }) => {
    try {
      const store = await resolveStore(mastra, requestContext, knowledgeKey);
      const results = await searchKnowledgeExplorerPages(store, {
        query: q,
        read: 'all',
        ...(scopeId?.length ? { scopeIds: scopeId } : {}),
        limit,
      });
      return { results: results.map(hit => ({ ...hit })) };
    } catch (error) {
      return handleError(error, 'Error searching Knowledge');
    }
  },
});

export const GET_KNOWLEDGE_ACTIVITY_ROUTE = createRoute({
  method: 'GET',
  path: '/knowledge/:knowledgeKey/activity',
  responseType: 'json',
  pathParamSchema: knowledgePathParams,
  queryParamSchema: knowledgeActivityQuerySchema,
  responseSchema: knowledgeActivityResponseSchema,
  summary: 'List recent Knowledge activity',
  description: 'Returns a newest-first page of activity, optionally for one scope or one page',
  tags: ['Knowledge'],
  requiresAuth: true,
  handler: async ({ mastra, requestContext, knowledgeKey, scopeId, pageId, cursor, limit }) => {
    try {
      const store = await resolveStore(mastra, requestContext, knowledgeKey);
      return { ...(await readKnowledgePageActivity(store, { read: 'all', scopeId, pageId, cursor, limit })) };
    } catch (error) {
      return handleError(error, 'Error reading Knowledge activity');
    }
  },
});
