// @vitest-environment jsdom
import type { AggregateTracesResponse, DashboardWidget } from '@mastra/client-js';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentRunsByName,
  agentRunsByProjectAndName,
  agentTokensByName,
  modelSpansByModel,
  previousAgentUsage,
  previousWithRetiredAgent,
  threadResourcesFixture,
  tokensByEnvironment,
  toolCallsByName,
  tracesByEnvironment,
  tracesByProject,
  tracesByProjectAndThread,
  tracesByThread,
  usageByModel,
  usageByThread,
} from '../../metrics/components/__tests__/fixtures/breakdown';
import { agentLatencyFixture, emptyBreakdownFixture } from '../../metrics/components/__tests__/fixtures/metrics';
import {
  aggregateCapabilities,
  distinctIdsSeriesFixture,
  distinctIdsTotalsFixture,
  traceAggregateCapabilities,
} from '../../metrics/components/__tests__/fixtures/trace-aggregate';
import {
  renderInMetrics,
  seedMetrics,
  serveCapabilities,
  serveTraceAggregate,
} from '../../metrics/components/__tests__/metrics-msw';
import { AgentRunsCard } from '../../metrics/components/agent-runs-card';
import { BreakdownCard } from '../../metrics/components/breakdown-card';
import { DistinctIdsCard } from '../../metrics/components/distinct-ids-card';
import { FailureRateCard } from '../../metrics/components/failure-rate-card';
import { LatencyCard } from '../../metrics/components/latency-card';
import { MetricsKpis } from '../../metrics/components/metrics-kpis';
import { ScoresCard } from '../../metrics/components/scores-card';
import { TokenUsageCard } from '../../metrics/components/token-usage-card';
import type { MetricsScope } from '../../metrics/hooks/use-metrics';
import { DashboardRenderer } from '../components/dashboard-renderer';
import type { DashboardScope, OnDashboardDrilldown } from '../lib/definition';
import {
  API,
  BREAKDOWN_TABS,
  SCOPES,
  TEST_NOW,
  endsNow,
  expectSame,
  expectSameTab,
  find,
  metricsWidget,
  normalise,
  recordRequests,
  serveBreakdown,
  settle,
} from './equality-harness';
import type { AggregateBody, MetricsBody, Rendered } from './equality-harness';
import { useFixedChartSize } from '@/test/chart-size';
import { server } from '@/test/msw-server';
import { TEST_BASE_URL } from '@/test/render';

/**
 * Each of today's Metrics cards next to its `METRICS_DASHBOARD` widget: both must send the same requests
 * (bodies and count) and render the same DOM, at project and org scope. These gate #28714.
 */

const kpisWidget = metricsWidget('kpis');
const tokenUsageWidget = metricsWidget('token-usage');
const agentRunsWidget = metricsWidget('agent-runs');
const failureRateWidget = metricsWidget('failure-rate');
const latencyWidget = metricsWidget('latency');
const distinctIdsWidget = metricsWidget('distinct-ids');
const breakdownWidget = metricsWidget('breakdown');
const scoresWidget = metricsWidget('scores');

/** The dashboard scope matching a test's page: an org page is the one that labels projects. */
const dashboardScope = (scope: MetricsScope | undefined): DashboardScope => (scope ? 'org' : 'project');

function rootOf(page: RenderedPage, id: string): Rendered {
  const rendered = page.roots[id];
  if (!rendered) throw new Error(`No ${id} on the page`);
  return rendered;
}

async function renderCard(ui: ReactElement, scope: MetricsScope | undefined): Promise<Rendered> {
  const recorder = recordRequests();
  const { container } = renderInMetrics(<div data-testid="card">{ui}</div>, { scope });
  await settle(recorder);
  recorder.stop();
  return { root: find(container, '[data-testid="card"]'), sent: recorder.sent };
}

async function renderWidget(
  widget: DashboardWidget,
  scope: MetricsScope | undefined,
  onDrilldown: OnDashboardDrilldown = () => {},
): Promise<Rendered> {
  const recorder = recordRequests();
  const { container } = renderInMetrics(
    <DashboardRenderer
      definition={{ schemaVersion: 1, rows: [{ widgets: [widget] }] }}
      scope={dashboardScope(scope)}
      onDrilldown={onDrilldown}
    />,
    { scope },
  );
  await settle(recorder);
  recorder.stop();
  return { root: find(container, `[data-widget-id="${widget.id}"]`), sent: recorder.sent };
}

type RenderedPage = { sent: string[]; roots: Record<string, Rendered> };

async function renderCards(
  cards: Record<string, ReactElement>,
  scope: MetricsScope | undefined,
): Promise<RenderedPage> {
  const recorder = recordRequests();
  const { container } = renderInMetrics(
    <>
      {Object.entries(cards).map(([id, ui]) => (
        <div key={id} data-testid={id}>
          {ui}
        </div>
      ))}
    </>,
    { scope },
  );
  await settle(recorder);
  recorder.stop();
  const roots = Object.fromEntries(
    Object.keys(cards).map(id => [id, { root: find(container, `[data-testid="${id}"]`), sent: [] }]),
  );
  return { sent: recorder.sent, roots };
}

async function renderWidgets(widgets: DashboardWidget[], scope: MetricsScope | undefined): Promise<RenderedPage> {
  const recorder = recordRequests();
  const { container } = renderInMetrics(
    <DashboardRenderer
      definition={{ schemaVersion: 1, rows: [{ widgets }] }}
      scope={dashboardScope(scope)}
      onDrilldown={() => {}}
    />,
    { scope },
  );
  await settle(recorder);
  recorder.stop();
  const roots = Object.fromEntries(
    widgets.map(w => [w.id, { root: find(container, `[data-widget-id="${w.id}"]`), sent: [] }]),
  );
  return { sent: recorder.sent, roots };
}

const noop = () => {};

/** Thirty tools, capped by the server; half were called last window, at other counts. */
function serveManyTools() {
  const tool = (i: number, count: number) => ({
    dimensions: { entityName: `tool-${String(i).padStart(2, '0')}` },
    measures: { count, errorCount: i % 4, errorRate: (i % 4) / count, 'duration.p95': 100 * ((i * 7) % 13) },
  });
  server.use(
    http.post<never, AggregateBody>(`${API}/spans/aggregate`, async ({ request }) => {
      const body = await request.clone().json();
      if (!JSON.stringify(body.where).includes('tool_call')) return undefined;
      if (endsNow(body.timeRange.to)) {
        return HttpResponse.json({
          rows: Array.from({ length: 30 }, (_, i) => tool(i, 10 + ((i * 11) % 29))),
          truncated: true,
        });
      }
      return HttpResponse.json({ rows: Array.from({ length: 15 }, (_, i) => tool(i * 2, 5 + i)), truncated: false });
    }),
  );
}

/** Clicks the same control in both; neither may send a request. */
async function clickBoth(card: Rendered, widget: Rendered, role: 'button', name: string | RegExp) {
  for (const side of [card, widget]) {
    const recorder = recordRequests();
    fireEvent.click(within(side.root).getByRole(role, { name }));
    await settle(recorder);
    recorder.stop();
    expect(recorder.sent).toEqual([]);
  }
  expect(normalise(widget.root.innerHTML)).toBe(normalise(card.root.innerHTML));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(TEST_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(Object.entries(SCOPES))('cards and their widgets at %s scope', (_name, scope) => {
  beforeEach(() => {
    seedMetrics();
  });

  describe('KPIs', () => {
    const both = async () => ({
      card: await renderCard(<MetricsKpis />, scope),
      widget: await renderWidget(kpisWidget, scope),
    });

    it('matches the card', async () => {
      const { card, widget } = await both();
      expectSame(card, widget);
    });

    it('shows the run count', async () => {
      const widget = await renderWidget(kpisWidget, scope);
      expect(within(widget.root).getByText('693')).toBeDefined();
    });
  });

  // Token usage, Agent runs and Failure rate share one set of requests (`useMetricsActivity`), so a
  // card alone sends all four; compare them as the page shows them, together.
  describe('Token usage, Agent runs and Failure rate', () => {
    const ACTIVITY = ['token-usage', 'agent-runs', 'failure-rate'];
    const cardsPage = () =>
      renderCards(
        {
          'token-usage': <TokenUsageCard onViewTraces={noop} onTimeRangeClick={noop} />,
          'agent-runs': <AgentRunsCard onTimeRangeClick={noop} />,
          'failure-rate': <FailureRateCard onViewErrors={noop} onTimeRangeClick={noop} />,
        },
        scope,
      );
    const widgetsPage = () => renderWidgets([tokenUsageWidget, agentRunsWidget, failureRateWidget], scope);

    it('sends the cards’ four requests between them', async () => {
      const cards = await cardsPage();
      const widgets = await widgetsPage();
      expect(widgets.sent).toHaveLength(4);
      expect(widgets.sent.toSorted()).toEqual(cards.sent.toSorted());
    });

    it.each(ACTIVITY)('matches the %s card', async id => {
      const cards = await cardsPage();
      const widgets = await widgetsPage();
      expectSame(rootOf(cards, id), rootOf(widgets, id));
    });

    it('matches the Token usage card on the Cost tab', async () => {
      const cards = await cardsPage();
      const widgets = await widgetsPage();
      await expectSameTab(rootOf(cards, 'token-usage'), rootOf(widgets, 'token-usage'), 'Cost');
    });

    it('totals tokens on the Tokens tab', async () => {
      const widgets = await widgetsPage();
      expect(within(rootOf(widgets, 'token-usage').root).getByText('1.30K')).toBeDefined();
    });

    it('totals spend on the Cost tab', async () => {
      const widgets = await widgetsPage();
      const tokens = rootOf(widgets, 'token-usage');
      fireEvent.click(within(tokens.root).getByRole('tab', { name: 'Cost' }));
      expect(await within(tokens.root).findByText('$0.75')).toBeDefined();
    });
  });

  describe('Latency', () => {
    const both = async () => ({
      card: await renderCard(<LatencyCard onViewTraces={noop} onTimeRangeClick={noop} />, scope),
      widget: await renderWidget(latencyWidget, scope),
    });

    it('matches the card', async () => {
      const { card, widget } = await both();
      expectSame(card, widget);
    });

    it.each(['Workflows', 'Tools'])('matches the card on the %s tab', async tab => {
      const { card, widget } = await both();
      await expectSameTab(card, widget, tab);
    });

    it('labels the P95 line', async () => {
      const widget = await renderWidget(latencyWidget, scope);
      expect(within(widget.root).getByText('P95')).toBeDefined();
    });

    it('sends one request for a tab and says when it has no runs', async () => {
      const widget = await renderWidget(latencyWidget, scope);
      const recorder = recordRequests();
      fireEvent.click(within(widget.root).getByRole('tab', { name: 'Workflows' }));
      expect(await within(widget.root).findByText('No workflow runs in this range.')).toBeDefined();
      await settle(recorder);
      recorder.stop();
      expect(recorder.sent).toHaveLength(1);
    });
  });

  describe('Resources and threads', () => {
    beforeEach(() => {
      serveCapabilities(traceAggregateCapabilities);
      serveTraceAggregate(request =>
        request.interval ? distinctIdsSeriesFixture(request.timeRange) : distinctIdsTotalsFixture,
      );
    });

    it('matches the card', async () => {
      const card = await renderCard(<DistinctIdsCard onTimeRangeClick={noop} />, scope);
      expectSame(card, await renderWidget(distinctIdsWidget, scope));
    });

    it('names the resources line', async () => {
      const widget = await renderWidget(distinctIdsWidget, scope);
      expect(within(widget.root).getByText('Resources')).toBeDefined();
    });
  });

  describe('Breakdown', () => {
    beforeEach(() => {
      serveBreakdown();
    });
    const both = async (onRowClick = noop, onDrilldown: OnDashboardDrilldown = noop) => ({
      card: await renderCard(<BreakdownCard onRowClick={onRowClick} />, scope),
      widget: await renderWidget(breakdownWidget, scope, onDrilldown),
    });

    it('matches the card on the tab it opens on', async () => {
      const { card, widget } = await both();
      expectSame(card, widget);
    });

    // Org-wide it opens on Projects, with two to compare; a project opens on Agents.
    it(`opens on ${scope ? 'Projects' : 'Agents'}`, async () => {
      const widget = await renderWidget(breakdownWidget, scope);
      expect(within(widget.root).getByRole('tab', { selected: true }).textContent).toBe(scope ? 'Projects' : 'Agents');
    });

    it.each(BREAKDOWN_TABS[scope ? 'org' : 'project'])('matches the card on the %s tab', async tab => {
      const { card, widget } = await both();
      await expectSameTab(card, widget, tab);
    });

    it.each(['Agents', 'Tools', 'Models', 'Threads', 'Environments', ...(scope ? ['Projects'] : [])])(
      'drills into the clicked %s row as the card does',
      async tab => {
        const onRowClick = vi.fn();
        const onDrilldown = vi.fn();
        const { card, widget } = await both(onRowClick, onDrilldown);
        for (const side of [card, widget]) {
          const recorder = recordRequests();
          fireEvent.click(within(side.root).getByRole('tab', { name: tab }));
          await settle(recorder);
          recorder.stop();
          // The first row under the header.
          const first = within(side.root).getAllByRole('row')[1];
          if (!first) throw new Error(`No rows on ${tab}`);
          fireEvent.click(first);
        }
        expect(onRowClick).toHaveBeenCalledTimes(1);
        expect(onDrilldown).toHaveBeenCalledExactlyOnceWith('traces', onRowClick.mock.lastCall?.[0]);
      },
    );

    it.skipIf(scope)('opens the busiest agent’s traces from its row', async () => {
      const onDrilldown = vi.fn();
      const widget = await renderWidget(breakdownWidget, scope, onDrilldown);
      const first = within(widget.root).getAllByRole('row')[1];
      if (!first) throw new Error('No agent rows');
      fireEvent.click(first);
      expect(onDrilldown).toHaveBeenCalledWith(
        'traces',
        expect.objectContaining({ span: expect.objectContaining({ entityName: 'Explore Subagent' }) }),
      );
    });

    describe('with more tools than a page and a capped list', () => {
      beforeEach(() => {
        serveManyTools();
      });
      const toolsTab = async () => {
        const { card, widget } = await both();
        await expectSameTab(card, widget, 'Tools');
        return { card, widget };
      };

      it('matches the card', async () => {
        await toolsTab();
      });

      it('says sorting covers only the busiest', async () => {
        const { widget } = await toolsTab();
        expect(within(widget.root).getByText('Showing the 500 busiest; sorting covers only these.')).toBeDefined();
      });

      it('pages the rows', async () => {
        const { widget } = await toolsTab();
        expect(within(widget.root).getAllByRole('row')).toHaveLength(14);
        expect(within(widget.root).getByRole('button', { name: 'Next' })).toBeDefined();
      });

      // Each header cycles first direction, the other, then back to the default; % Change follows
      // the column sorted last.
      it('sorts as the card does', async () => {
        const { card, widget } = await toolsTab();
        for (const header of ['Errors', 'Errors', 'Errors', '% Change', 'P95 latency', '% Change', 'Spans', 'Spans']) {
          await clickBoth(card, widget, 'button', header);
        }
      });

      it('pages as the card does', async () => {
        const { card, widget } = await toolsTab();
        await clickBoth(card, widget, 'button', 'Next');
        await clickBoth(card, widget, 'button', '% Change');
      });

      it('sorts by a column on the first click, the other way on the second', async () => {
        const { widget } = await toolsTab();
        const errors = within(widget.root).getByRole('button', { name: 'Errors' });
        fireEvent.click(errors);
        expect(errors.closest('[aria-sort]')?.getAttribute('aria-sort')).toBe('descending');
        fireEvent.click(errors);
        expect(errors.closest('[aria-sort]')?.getAttribute('aria-sort')).toBe('ascending');
      });
    });
  });

  // Scores need a project; the org page leaves them out.
  describe.runIf(!scope)('Scores', () => {
    it('matches the card', async () => {
      const card = await renderCard(<ScoresCard />, scope);
      expectSame(card, await renderWidget(scoresWidget, scope));
    });

    it('names each scorer', async () => {
      const widget = await renderWidget(scoresWidget, scope);
      expect(within(widget.root).getByText('Answer relevancy')).toBeDefined();
    });
  });
});

/** A tab's requests held until released, to compare what each shows while the tab loads. */
function holdPercentiles(metric: string) {
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  server.use(
    http.post<never, MetricsBody>(`${API}/metrics/percentiles`, async ({ request }) => {
      const body = await request.clone().json();
      if (body.name !== metric) return undefined;
      await held;
      return HttpResponse.json(agentLatencyFixture());
    }),
  );
  return release;
}

/** Clicks a tab in both and returns their markup once each has sent its requests, before answers. */
async function switchWhileLoading(card: Rendered, widget: Rendered, tab: string) {
  for (const side of [card, widget]) {
    const recorder = recordRequests();
    fireEvent.click(within(side.root).getByRole('tab', { name: tab }));
    await waitFor(() => expect(recorder.sent.length).toBeGreaterThan(0));
    recorder.stop();
    side.sent = recorder.sent;
  }
}

/** The tooltip shown while hovering the middle of each chart, one after the other. */
async function tooltipsOf(root: HTMLElement) {
  const tips: string[] = [];
  for (const wrapper of root.querySelectorAll('.recharts-wrapper')) {
    fireEvent.mouseMove(wrapper, { clientX: 400, clientY: 100 });
    await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))));
    const portals = document.body.querySelectorAll('[data-slot="chart-tooltip-portal"]');
    tips.push(normalise([...portals].map(p => p.innerHTML).join('')));
    fireEvent.mouseLeave(wrapper);
    await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))));
  }
  return tips;
}

/** Same markup at real size, and the same tooltip on hovering each chart. */
async function expectSameDrawn(card: Rendered, widget: Rendered) {
  expect(card.root.querySelector('.recharts-surface')).not.toBeNull();
  expect(normalise(widget.root.innerHTML)).toBe(normalise(card.root.innerHTML));
  const tips = await tooltipsOf(card.root);
  expect(tips.length).toBeGreaterThan(0);
  expect(tips.every(t => t.length > 0)).toBe(true);
  expect(await tooltipsOf(widget.root)).toEqual(tips);
}

describe('Charts drawn at real size', () => {
  useFixedChartSize(800, 300);

  beforeEach(() => {
    seedMetrics();
  });

  describe('Token usage, Agent runs and Failure rate', () => {
    const pages = async () => ({
      cards: await renderCards(
        {
          'token-usage': <TokenUsageCard onViewTraces={noop} onTimeRangeClick={noop} />,
          'agent-runs': <AgentRunsCard onTimeRangeClick={noop} />,
          'failure-rate': <FailureRateCard onViewErrors={noop} onTimeRangeClick={noop} />,
        },
        undefined,
      ),
      widgets: await renderWidgets([tokenUsageWidget, agentRunsWidget, failureRateWidget], undefined),
    });

    it.each(['token-usage', 'agent-runs', 'failure-rate'])('draws %s as the card does', async id => {
      const { cards, widgets } = await pages();
      await expectSameDrawn(rootOf(cards, id), rootOf(widgets, id));
    });

    it('draws the Token usage Cost tab as the card does', async () => {
      const { cards, widgets } = await pages();
      const card = rootOf(cards, 'token-usage');
      const widget = rootOf(widgets, 'token-usage');
      await expectSameTab(card, widget, 'Cost');
      await expectSameDrawn(card, widget);
    });
  });

  it('draws Latency as the card does', async () => {
    await expectSameDrawn(
      await renderCard(<LatencyCard onViewTraces={noop} onTimeRangeClick={noop} />, undefined),
      await renderWidget(latencyWidget, undefined),
    );
  });

  it('draws Scores as the card does', async () => {
    await expectSameDrawn(await renderCard(<ScoresCard />, undefined), await renderWidget(scoresWidget, undefined));
  });

  it('draws Resources and threads as the card does', async () => {
    serveCapabilities(traceAggregateCapabilities);
    serveTraceAggregate(request =>
      request.interval ? distinctIdsSeriesFixture(request.timeRange) : distinctIdsTotalsFixture,
    );
    await expectSameDrawn(
      await renderCard(<DistinctIdsCard onTimeRangeClick={noop} />, undefined),
      await renderWidget(distinctIdsWidget, undefined),
    );
  });

  it('shows a tooltip on hovering a chart', async () => {
    const widget = await renderWidget(latencyWidget, undefined);
    const [tip] = await tooltipsOf(widget.root);
    expect(tip).toContain('P95');
  });
});

describe('Latency switching tabs, drawn at real size', () => {
  useFixedChartSize(800, 300);

  beforeEach(() => {
    seedMetrics();
  });

  const both = async () => ({
    card: await renderCard(<LatencyCard onViewTraces={noop} onTimeRangeClick={noop} />, undefined),
    widget: await renderWidget(latencyWidget, undefined),
  });

  it('keeps the last tab’s chart, dimmed, while the next loads, as the card does', async () => {
    holdPercentiles('mastra_workflow_duration_ms');
    const { card, widget } = await both();
    await switchWhileLoading(card, widget, 'Workflows');
    expect(widget.root.querySelector('.recharts-area-curve')).not.toBeNull();
    expectSame(card, widget);
  });

  it('shows the next tab once it loads, as the card does', async () => {
    const release = holdPercentiles('mastra_workflow_duration_ms');
    const { card, widget } = await both();
    await switchWhileLoading(card, widget, 'Workflows');
    release();
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(normalise(widget.root.innerHTML)).toBe(normalise(card.root.innerHTML));
  });

  it('refetches a tab opened again, as the card does', async () => {
    const { card, widget } = await both();
    await expectSameTab(card, widget, 'Workflows');
    await expectSameTab(card, widget, 'Agents');
    expect(widget.sent).toHaveLength(1);
  });
});
