import type { KnowledgeGraphResponse } from '@mastra/client-js';
import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { PermissionDenied } from '@mastra/playground-ui/domains/auth/components/permission-denied';
import { SessionExpired } from '@mastra/playground-ui/domains/auth/components/session-expired';
import { KnowledgePageDetail } from '@mastra/playground-ui/domains/knowledge/components/KnowledgePageDetail';
import { KnowledgePageGraph } from '@mastra/playground-ui/domains/knowledge/components/KnowledgePageGraph';
import { KnowledgePageTree } from '@mastra/playground-ui/domains/knowledge/components/KnowledgePageTree';
import type { KnowledgePagePayload } from '@mastra/playground-ui/domains/knowledge/pageTypes';
import { is401UnauthorizedError, is403ForbiddenError, is404NotFoundError } from '@mastra/playground-ui/utils/errors';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  useKnowledgeInstances,
  useKnowledgePage,
  useKnowledgePageGraph,
  useKnowledgeSearch,
} from '@/domains/knowledge/use-studio-knowledge';
import { navCrumb } from '@/domains/navigation/crumbs';

const crumbs = [navCrumb('/knowledge')];

type View = 'tree' | 'graph';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout breadcrumbs={<PageBreadcrumbs crumbs={crumbs} />}>
      <h1 className="sr-only">Knowledge</h1>
      {children}
    </PageLayout>
  );
}

function SelectedPage({
  knowledgeKey,
  pageId,
  pagesById,
  onSelect,
}: {
  knowledgeKey: string;
  pageId: string;
  pagesById: ReadonlyMap<string, KnowledgePagePayload>;
  onSelect: (page: KnowledgePagePayload) => void;
}) {
  const detail = useKnowledgePage(knowledgeKey, pageId);
  // The detail's ancestors and referenced pages may sit outside the loaded graph; add them for names and links.
  const known = useMemo(() => {
    if (!detail.data) return pagesById;
    const merged = new Map(pagesById);
    for (const page of [...detail.data.ancestors, ...detail.data.related]) merged.set(page.id, page);
    return merged;
  }, [detail.data, pagesById]);

  if (detail.isPending) return <p className="text-ui-md p-4 text-muted-foreground">Loading page…</p>;
  if (detail.isError) {
    return (
      <EmptyState
        tone="error"
        variant="fill"
        titleSlot={is404NotFoundError(detail.error) ? 'Page not found' : 'Failed to load the page'}
        descriptionSlot={
          is404NotFoundError(detail.error) ? 'It may have been deleted or merged.' : detail.error.message
        }
      />
    );
  }
  return (
    <KnowledgePageDetail
      page={detail.data.page}
      notes={detail.data.notes}
      pin={detail.data.pin ?? undefined}
      pagesById={known}
      onPageClick={onSelect}
    />
  );
}

function SearchBox({ knowledgeKey, onSelect }: { knowledgeKey: string; onSelect: (pageId: string) => void }) {
  const [query, setQuery] = useState('');
  const search = useKnowledgeSearch(knowledgeKey, query);
  const results = query.trim().length >= 2 ? (search.data?.results ?? []) : [];
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

function Explorer({ knowledgeKey, graph }: { knowledgeKey: string; graph: KnowledgeGraphResponse }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPageId = searchParams.get('page');
  const view: View = searchParams.get('view') === 'graph' ? 'graph' : 'tree';
  const pagesById = useMemo(() => new Map(graph.pages.map(page => [page.id, page])), [graph.pages]);
  const mentionEdges = useMemo(() => graph.edges.filter(edge => edge.kind === 'mention'), [graph.edges]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) next.delete(name);
      else next.set(name, value);
    }
    setSearchParams(next);
  };
  const select = (pageId: string) => update({ page: pageId });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox knowledgeKey={knowledgeKey} onSelect={select} />
        <div role="group" aria-label="View" className="flex rounded border border-border lg:hidden">
          {(['tree', 'graph'] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              className="text-ui-md px-3 py-1 aria-pressed:bg-muted"
              onClick={() => update({ view: option })}
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
      {/* Below lg the row stacks: the selected page sits under the active view so the graph keeps its width. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside
          className={`min-h-0 w-full flex-1 overflow-auto rounded border border-border lg:block lg:w-72 lg:flex-none lg:shrink-0 ${view === 'tree' ? 'block' : 'hidden'}`}
        >
          <KnowledgePageTree pages={graph.pages} selectedPageId={selectedPageId} onSelect={page => select(page.id)} />
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
            onSelect={page => select(page.id)}
          />
        </div>
        {selectedPageId ? (
          <section
            aria-label="Selected page"
            className="max-h-[45%] min-h-0 w-full shrink-0 overflow-auto rounded border border-border lg:max-h-none lg:w-96"
          >
            <SelectedPage
              knowledgeKey={knowledgeKey}
              pageId={selectedPageId}
              pagesById={pagesById}
              onSelect={page => select(page.id)}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const instances = useKnowledgeInstances();
  const knowledgeKey = searchParams.get('instance') ?? instances.data?.[0]?.key;
  const graph = useKnowledgePageGraph(knowledgeKey);

  const error = instances.error ?? graph.error;
  if (error && is401UnauthorizedError(error)) {
    return (
      <Shell>
        <SessionExpired variant="fill" />
      </Shell>
    );
  }
  if (error && is403ForbiddenError(error)) {
    return (
      <Shell>
        <PermissionDenied variant="fill" resource="knowledge" />
      </Shell>
    );
  }
  // The Knowledge routes are opt-in, so a server that has not registered them 404s.
  if (instances.error && is404NotFoundError(instances.error)) {
    return (
      <Shell>
        <EmptyState
          variant="fill"
          titleSlot="Knowledge browsing is not enabled"
          descriptionSlot="This server does not register the Knowledge routes. Add KNOWLEDGE_ROUTES from @mastra/server/server-adapter to server.apiRoutes, then reload."
        />
      </Shell>
    );
  }
  if (instances.error) {
    return (
      <Shell>
        <EmptyState
          tone="error"
          variant="fill"
          titleSlot="Failed to load Knowledge"
          descriptionSlot={instances.error.message}
        />
      </Shell>
    );
  }
  if (instances.data && instances.data.length === 0) {
    return (
      <Shell>
        <EmptyState
          variant="fill"
          titleSlot="No Knowledge instances"
          descriptionSlot="Register one on your Mastra instance with the knowledge option to browse it here."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
        {instances.data && instances.data.length > 1 ? (
          <select
            aria-label="Knowledge instance"
            className="text-ui-md h-8 w-fit rounded border border-border bg-card px-2"
            value={knowledgeKey}
            onChange={event => setSearchParams(new URLSearchParams({ instance: event.target.value }))}
          >
            {instances.data.map(instance => (
              <option key={instance.key} value={instance.key}>
                {instance.key}
              </option>
            ))}
          </select>
        ) : null}
        {!knowledgeKey || graph.isPending ? (
          <p className="text-ui-md p-4 text-muted-foreground">Loading knowledge…</p>
        ) : graph.isError ? (
          <EmptyState
            tone="error"
            variant="fill"
            titleSlot="Failed to load Knowledge"
            descriptionSlot={graph.error.message}
          />
        ) : graph.data.pages.length === 0 ? (
          <EmptyState
            variant="fill"
            titleSlot="No pages yet"
            descriptionSlot="Agents add pages and notes to Knowledge as they run. They will appear here."
          />
        ) : (
          <Explorer knowledgeKey={knowledgeKey} graph={graph.data} />
        )}
      </div>
    </Shell>
  );
}
