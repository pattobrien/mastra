import type {
  KnowledgeGraphResponse,
  KnowledgeInstanceSummary,
  KnowledgePageResponse,
  KnowledgeSearchResponse,
} from '@mastra/client-js';

type Page = KnowledgeGraphResponse['pages'][number];

const at = '2026-01-01T00:00:00.000Z';

const page = (
  fields: Pick<Page, 'id' | 'scopeId' | 'parentId' | 'isScope' | 'name' | 'position'> & Partial<Page>,
): Page => ({
  version: 1,
  createdBy: { author: 'agent:alex' },
  updatedBy: { author: 'agent:alex' },
  createdAt: at,
  updatedAt: at,
  ...fields,
});

export const knowledgeInstances: { instances: KnowledgeInstanceSummary[] } = {
  instances: [{ key: 'main', id: 'kb' }],
};

export const orgScope = page({
  id: 'scope-acme',
  scopeId: 'scope-acme',
  parentId: null,
  isScope: true,
  address: 'org:acme',
  declaration: 'org:$orgId',
  name: 'Acme',
  position: 'a0',
});

export const paymentsPage = page({
  id: 'page-payments',
  scopeId: 'scope-acme',
  parentId: 'scope-acme',
  isScope: false,
  key: 'payments',
  name: 'Payments Service',
  description: 'Handles card charges.',
  position: 'a0',
});

export const runbookPage = page({
  id: 'page-runbook',
  scopeId: 'scope-acme',
  parentId: 'scope-acme',
  isScope: false,
  name: 'Deploy Runbook',
  position: 'a1',
});

export const knowledgeGraph: KnowledgeGraphResponse = {
  pages: [orgScope, paymentsPage, runbookPage],
  outsideIds: [],
  edges: [
    { source: 'scope-acme', target: 'page-payments', kind: 'parent' },
    { source: 'scope-acme', target: 'page-runbook', kind: 'parent' },
    { source: 'page-runbook', target: 'page-payments', kind: 'mention', count: 1 },
  ],
  pinnedIds: ['page-payments'],
  truncated: false,
};

export const emptyKnowledgeGraph: KnowledgeGraphResponse = {
  pages: [],
  outsideIds: [],
  edges: [],
  pinnedIds: [],
  truncated: false,
};

export const paymentsPageView: KnowledgePageResponse = {
  page: paymentsPage,
  ancestors: [orgScope],
  notes: [
    {
      id: 'note-1',
      pageId: 'page-payments',
      text: 'Retries card charges three times before failing.',
      stampScopeIds: ['scope-acme'],
      mentions: [],
      provenance: { author: 'agent:alex' },
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
  ],
  pin: null,
  related: [],
  mentionedBy: [],
};

export const runbookSearch: KnowledgeSearchResponse = {
  results: [{ type: 'page', page: runbookPage }],
};
