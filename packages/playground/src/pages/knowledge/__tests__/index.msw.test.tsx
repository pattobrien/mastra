import { TooltipProvider } from '@mastra/playground-ui/components/Tooltip';
import { LinkComponentProvider } from '@mastra/playground-ui/lib/framework';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import KnowledgePage from '..';
import {
  emptyKnowledgeGraph,
  knowledgeGraph,
  knowledgeInstances,
  paymentsPageView,
  runbookSearch,
} from './fixtures/knowledge';
import { Link } from '@/lib/link';
import { stubLinkPaths } from '@/test/link-provider';
import { server } from '@/test/msw-server';
import { renderWithProviders, TEST_BASE_URL } from '@/test/render';

const api = `${TEST_BASE_URL}/api/knowledge`;

const renderPage = (entry = '/knowledge') =>
  renderWithProviders(
    <TooltipProvider>
      <LinkComponentProvider Link={Link} navigate={() => {}} paths={stubLinkPaths}>
        <Routes>
          <Route path="/knowledge" element={<KnowledgePage />} />
        </Routes>
      </LinkComponentProvider>
    </TooltipProvider>,
    { router: { initialEntries: [entry] } },
  );

const withInstance = (graph = knowledgeGraph) =>
  server.use(
    http.get(api, () => HttpResponse.json(knowledgeInstances)),
    http.get(`${api}/main/graph`, () => HttpResponse.json(graph)),
  );

describe('Knowledge page', () => {
  describe('when the server has no Knowledge instances', () => {
    it('explains how to register one', async () => {
      server.use(http.get(api, () => HttpResponse.json({ instances: [] })));
      renderPage();
      expect(await screen.findByText('No Knowledge instances')).toBeTruthy();
    });
  });

  describe('when the server does not register the Knowledge routes', () => {
    it('explains how to opt into them', async () => {
      server.use(http.get(api, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })));
      renderPage();
      expect(await screen.findByText('Knowledge browsing is not enabled')).toBeTruthy();
    });
  });

  describe('when the caller lacks knowledge:read', () => {
    it('shows the permission wall', async () => {
      server.use(http.get(api, () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 })));
      renderPage();
      expect(await screen.findByText(/Permission Denied/i)).toBeTruthy();
    });
  });

  describe('when the instance has no pages yet', () => {
    it('says agents add them as they run', async () => {
      withInstance(emptyKnowledgeGraph);
      renderPage();
      expect(await screen.findByText('No pages yet')).toBeTruthy();
    });
  });

  describe('when the instance has pages', () => {
    it('reads the graph without asking for a scope', async () => {
      const graphQueries: string[] = [];
      server.use(
        http.get(api, () => HttpResponse.json(knowledgeInstances)),
        http.get(`${api}/main/graph`, ({ request }) => {
          graphQueries.push(new URL(request.url).search);
          return HttpResponse.json(knowledgeGraph);
        }),
      );
      renderPage();
      await waitFor(() => expect(graphQueries).toEqual(['']));
    });

    it('lists every page in the tree under its scope', async () => {
      withInstance();
      renderPage();
      const tree = await screen.findByRole('tree');
      expect(within(tree).getByText('Acme')).toBeTruthy();
      expect(within(tree).getByText('Payments Service')).toBeTruthy();
      expect(within(tree).getByText('Deploy Runbook')).toBeTruthy();
    });

    it('renders the graph beside the tree', async () => {
      withInstance();
      renderPage();
      expect(await screen.findByTestId('knowledge-graph-container')).toBeTruthy();
    });
  });

  describe('when a page is selected in the tree', () => {
    it('opens its detail with its notes', async () => {
      withInstance();
      server.use(http.get(`${api}/main/pages/page-payments`, () => HttpResponse.json(paymentsPageView)));
      renderPage();
      fireEvent.click(within(await screen.findByRole('tree')).getByText('Payments Service'));
      const detail = await screen.findByRole('region', { name: 'Selected page' });
      expect(await within(detail).findByText('Retries card charges three times before failing.')).toBeTruthy();
    });
  });

  describe('when the selected page no longer exists', () => {
    it('says it may have been deleted or merged', async () => {
      withInstance();
      server.use(
        http.get(`${api}/main/pages/page-gone`, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
      );
      renderPage('/knowledge?page=page-gone');
      expect(await screen.findByText('Page not found')).toBeTruthy();
    });
  });

  describe('when a search matches a page', () => {
    it('selects the page that is picked from the results', async () => {
      withInstance();
      server.use(
        http.get(`${api}/main/search`, () => HttpResponse.json(runbookSearch)),
        http.get(`${api}/main/pages/page-runbook`, () =>
          HttpResponse.json({ ...paymentsPageView, page: knowledgeGraph.pages[2], notes: [] }),
        ),
      );
      renderPage();
      fireEvent.change(await screen.findByLabelText('Search knowledge'), { target: { value: 'deploy' } });
      fireEvent.click(
        await within(await screen.findByRole('listbox')).findByRole('button', { name: 'Deploy Runbook' }),
      );
      const detail = await screen.findByRole('region', { name: 'Selected page' });
      expect(await within(detail).findByRole('heading', { name: 'Deploy Runbook' })).toBeTruthy();
    });
  });
});
