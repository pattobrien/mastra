import { useMemo, useState } from 'react';

import type { KnowledgeNotePayload, KnowledgePageEdge, KnowledgePagePayload, KnowledgePinPayload } from '../pageTypes';
import { KnowledgePageDetail } from './KnowledgePageDetail';
import { KnowledgePageGraph } from './KnowledgePageGraph';
import { KnowledgePageTree } from './KnowledgePageTree';

import { EmptyState } from '@/ds/components/EmptyState';

export type KnowledgeExplorerView = 'tree' | 'graph';

/** The bounded page graph a host loads; its pages also feed the tree. */
export interface KnowledgeExplorerGraph {
  pages: KnowledgePagePayload[];
  edges: KnowledgePageEdge[];
  pinnedIds: string[];
  truncated: boolean;
}

export interface KnowledgeExplorerPageDetail {
  page: KnowledgePagePayload;
  notes: KnowledgeNotePayload[];
  pin?: KnowledgePinPayload | null;
  /** Ancestors and referenced pages, which may sit outside the loaded graph. */
  ancestors: KnowledgePagePayload[];
  related: KnowledgePagePayload[];
}

interface QueryState<T> {
  data?: T;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Host data hooks. Each host binds them to its own routes (Studio to the Mastra client, Factory to its
 * project-scoped routes), so the explorer never knows a URL or an id outside the page ids it shows.
 * Pass the same functions every render: they are called as hooks.
 */
export interface KnowledgeExplorerSource {
  usePage: (pageId: string) => QueryState<KnowledgeExplorerPageDetail>;
  useSearch: (query: string) => { data?: { results: Array<{ page: KnowledgePagePayload }> } };
}

export interface KnowledgePageExplorerProps {
  graph: KnowledgeExplorerGraph;
  source: KnowledgeExplorerSource;
  selectedPageId: string | null;
  onSelect: (pageId: string) => void;
  /** The view shown below `lg`; wider screens show the tree and the graph together. */
  view: KnowledgeExplorerView;
  onViewChange: (view: KnowledgeExplorerView) => void;
}

const MIN_SEARCH_LENGTH = 2;

function isNotFound(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'status' in error && error.status === 404;
}

function SelectedPage({
  source,
  pageId,
  pagesById,
  onSelect,
}: {
  source: KnowledgeExplorerSource;
  pageId: string;
  pagesById: ReadonlyMap<string, KnowledgePagePayload>;
  onSelect: (pageId: string) => void;
}) {
  const detail = source.usePage(pageId);
  const known = useMemo(() => {
    if (!detail.data) return pagesById;
    const merged = new Map(pagesById);
    for (const page of [...detail.data.ancestors, ...detail.data.related]) merged.set(page.id, page);
    return merged;
  }, [detail.data, pagesById]);

  if (detail.isPending) return <p className="text-ui-md p-4 text-muted-foreground">Loading page…</p>;
  if (detail.isError || !detail.data) {
    const notFound = isNotFound(detail.error);
    return (
      <EmptyState
        tone="error"
        variant="fill"
        titleSlot={notFound ? 'Page not found' : 'Failed to load the page'}
        descriptionSlot={notFound ? 'It may have been deleted or merged.' : (detail.error?.message ?? '')}
      />
    );
  }
  return (
    <KnowledgePageDetail
      page={detail.data.page}
      notes={detail.data.notes}
      pin={detail.data.pin ?? undefined}
      pagesById={known}
      onPageClick={page => onSelect(page.id)}
    />
  );
}

function SearchBox({ source, onSelect }: { source: KnowledgeExplorerSource; onSelect: (pageId: string) => void }) {
  const [query, setQuery] = useState('');
  const search = source.useSearch(query);
  const results = query.trim().length >= MIN_SEARCH_LENGTH ? (search.data?.results ?? []) : [];
  const seen = new Set<string>();
  const pages = results
    .map(hit => hit.page)
    .filter(page => (seen.has(page.id) ? false : (seen.add(page.id), true)))
    .slice(0, 10);
  return (
    <div className="relative min-w-60 flex-1">
      <input
        aria-label="Search knowledge"
        placeholder="Search pages and notes"
        className="text-ui-md h-8 w-full rounded border border-border bg-card px-2"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      {pages.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Search results"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-border bg-card shadow-raised"
        >
          {pages.map(page => (
            <li key={page.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="text-ui-md w-full px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  onSelect(page.id);
                  setQuery('');
                }}
              >
                {page.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Search, page tree, page graph and the selected page's detail, kept in sync on one selection. Wide
 * screens show the tree beside the graph; below `lg` a Tree/Graph toggle picks one and the detail stacks
 * under it so the graph keeps its width.
 */
export function KnowledgePageExplorer({
  graph,
  source,
  selectedPageId,
  onSelect,
  view,
  onViewChange,
}: KnowledgePageExplorerProps) {
  const pagesById = useMemo(() => new Map(graph.pages.map(page => [page.id, page])), [graph.pages]);
  const mentionEdges = useMemo(() => graph.edges.filter(edge => edge.kind === 'mention'), [graph.edges]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox source={source} onSelect={onSelect} />
        <div role="group" aria-label="View" className="flex rounded border border-border lg:hidden">
          {(['tree', 'graph'] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              className="text-ui-md px-3 py-1 aria-pressed:bg-muted"
              onClick={() => onViewChange(option)}
            >
              {option === 'tree' ? 'Tree' : 'Graph'}
            </button>
          ))}
        </div>
      </div>
      {graph.truncated ? (
        <p className="text-ui-sm text-muted-foreground">
          Showing the first {graph.pages.length} pages. Search to reach the rest.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside
          className={`min-h-0 w-full flex-1 overflow-auto rounded border border-border lg:block lg:w-72 lg:flex-none lg:shrink-0 ${view === 'tree' ? 'block' : 'hidden'}`}
        >
          <KnowledgePageTree pages={graph.pages} selectedPageId={selectedPageId} onSelect={page => onSelect(page.id)} />
        </aside>
        <div
          className={`relative min-h-0 min-w-0 flex-1 lg:block lg:h-full ${view === 'graph' ? 'block' : 'hidden'}`}
          data-testid="knowledge-graph-container"
        >
          <KnowledgePageGraph
            pages={graph.pages}
            edges={mentionEdges}
            pinnedIds={graph.pinnedIds}
            selectedPageId={selectedPageId}
            onSelect={page => onSelect(page.id)}
          />
        </div>
        {selectedPageId ? (
          <section
            aria-label="Selected page"
            className="max-h-[45%] min-h-0 w-full shrink-0 overflow-auto rounded border border-border lg:max-h-none lg:w-96"
          >
            <SelectedPage source={source} pageId={selectedPageId} pagesById={pagesById} onSelect={onSelect} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
