// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../../test/render';
import type { KnowledgePagePayload } from '../../pageTypes';
import { KnowledgePageGraph } from '../KnowledgePageGraph';

/**
 * jsdom can't measure React Flow, so the test drives what the graph reads from it: the pane size React Flow
 * measured, whether every node has been measured, and the `fitView` call. Everything else is the real library.
 */
const flow = { width: 0, height: 0, nodesInitialized: false };
const fitView = vi.fn(async () => true);
vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    useReactFlow: () => ({ ...actual.useReactFlow(), fitView }),
    useNodesInitialized: () => flow.nodesInitialized,
    useStore: <T,>(selector: (state: { width: number; height: number }) => T) =>
      selector({ width: flow.width, height: flow.height }),
  };
});

const page = (id: string, parentId: string | null): KnowledgePagePayload => ({
  id,
  scopeId: parentId === null ? id : 'org',
  parentId,
  isScope: parentId === null,
  position: 'a0',
  name: id,
  version: 1,
  createdBy: { author: 'host' },
  updatedBy: { author: 'host' },
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
});

const pages = [page('org', null), page('refunds', 'org')];

// jsdom has no ResizeObserver, which React Flow uses to measure its viewport.
beforeAll(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('KnowledgePageGraph fitting its pages into view', () => {
  beforeEach(() => {
    Object.assign(flow, { width: 0, height: 0, nodesInitialized: false });
    fitView.mockClear();
  });

  async function renderGraph(selectedPageId?: string) {
    const graph = <KnowledgePageGraph pages={pages} edges={[]} selectedPageId={selectedPageId} onSelect={() => {}} />;
    const result = renderWithProviders(graph);
    await screen.findByTestId('knowledge-page-graph');
    return (next: { width?: number; height?: number; nodesInitialized?: boolean; selectedPageId?: string }) => {
      Object.assign(flow, next);
      result.rerender(
        <KnowledgePageGraph
          pages={pages}
          edges={[]}
          selectedPageId={next.selectedPageId ?? selectedPageId}
          onSelect={() => {}}
        />,
      );
    };
  }

  it('waits for the nodes to be measured on a cold load, then fits', async () => {
    Object.assign(flow, { width: 358, height: 392 });
    const update = await renderGraph();
    expect(fitView).not.toHaveBeenCalled();

    update({ nodesInitialized: true });
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('fits once a graph hidden behind a toggle is shown', async () => {
    Object.assign(flow, { nodesInitialized: true });
    const update = await renderGraph();
    expect(fitView).not.toHaveBeenCalled();

    update({ width: 358, height: 392 });
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('fits again when the graph is resized', async () => {
    Object.assign(flow, { width: 358, height: 392, nodesInitialized: true });
    const update = await renderGraph();
    fitView.mockClear();

    update({ width: 1024, height: 700 });
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("keeps the user's pan and zoom when only the selection changes", async () => {
    Object.assign(flow, { width: 358, height: 392, nodesInitialized: true });
    const update = await renderGraph();
    fitView.mockClear();

    update({ selectedPageId: 'refunds' });
    expect(fitView).not.toHaveBeenCalled();
  });
});

describe('KnowledgePageGraph labels', () => {
  it('puts a small page’s name under its circle, unclipped', async () => {
    renderWithProviders(<KnowledgePageGraph pages={pages} edges={[]} onSelect={() => {}} />);
    const nodes = await screen.findAllByTestId('knowledge-page-node');
    const small = nodes.filter(node => Number.parseFloat(node.style.width) < 88);
    expect(small.length).toBeGreaterThan(0);
    for (const node of small) {
      const name = node.getAttribute('data-page-id') ?? '';
      expect(node.querySelector('.knowledge-circle')?.textContent).toBe('');
      expect(node.textContent).toContain(name);
    }
  });
});
