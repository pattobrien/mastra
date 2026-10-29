import { Notice } from '@mastra/playground-ui/components/Notice';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { Txt } from '@mastra/playground-ui/components/Txt';
import { KnowledgePageExplorer } from '@mastra/playground-ui/domains/knowledge/components/KnowledgePageExplorer';
import type {
  KnowledgeExplorerSource,
  KnowledgeExplorerView,
} from '@mastra/playground-ui/domains/knowledge/components/KnowledgePageExplorer';
import { useInteractionIdle } from '@mastra/playground-ui/domains/knowledge/hooks/useInteractionIdle';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { useKnowledgeGraph, useKnowledgePage, useKnowledgeSearch } from '../../hooks/useKnowledgeGraph';
import { useSidebarHeaderSlots } from '../domains/chat/components/useSidebarHeaderSlots';
import { KnowledgeLoadingSkeleton } from '../domains/factory/components/knowledge/KnowledgeLoadingSkeleton';
import { useActiveFactory } from '../domains/workspaces/components/FactoryLayout';

/**
 * The Knowledge page: the project's Knowledge as a page tree and graph with the selected page's detail,
 * using the explorer Studio shares. The server reads as the project's org and project scopes, so a
 * member sees org and project pages but never another project's or a session's. `?page=` and `?view=`
 * keep the selection linkable and back-button safe.
 */
export function KnowledgePage() {
  const factory = useActiveFactory();
  const slots = useSidebarHeaderSlots();
  return (
    <PageLayout variant="fit" {...slots}>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <KnowledgeContent key={factory.id} factoryProjectId={factory.id} />
      </div>
    </PageLayout>
  );
}

function KnowledgeContent({ factoryProjectId }: { factoryProjectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Polling pauses while the user works the graph so new pages never shift it mid-exploration.
  const { idle, onActivity } = useInteractionIdle(10_000);
  const graph = useKnowledgeGraph(factoryProjectId, !idle);
  const selectedPageId = searchParams.get('page');
  const view: KnowledgeExplorerView = searchParams.get('view') === 'graph' ? 'graph' : 'tree';

  const source = useMemo<KnowledgeExplorerSource>(
    () => ({
      usePage: pageId => useKnowledgePage(factoryProjectId, pageId),
      useSearch: query => useKnowledgeSearch(factoryProjectId, query),
    }),
    [factoryProjectId],
  );

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [name, value] of Object.entries(changes)) next.set(name, value);
    setSearchParams(next);
  };

  if (graph.isPending) return <KnowledgeLoadingSkeleton label="Loading knowledge" layout="graph" />;
  if (graph.isError) return <Notice variant="destructive">{graph.error.message}</Notice>;
  if (graph.data.pages.length === 0) {
    return (
      <Txt tone="muted" as="p" variant="body">
        No knowledge in this project yet. Pages appear here as factory sessions write them.
      </Txt>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" onPointerDownCapture={onActivity} onWheelCapture={onActivity}>
      <KnowledgePageExplorer
        graph={graph.data}
        source={source}
        selectedPageId={selectedPageId}
        onSelect={pageId => update({ page: pageId })}
        view={view}
        onViewChange={next => update({ view: next })}
      />
    </div>
  );
}
