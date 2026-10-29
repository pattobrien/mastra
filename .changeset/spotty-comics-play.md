---
'@mastra/playground-ui': minor
---

Added `METRICS_DASHBOARD`, the built-in Metrics dashboard as a dashboard definition. Pass it to `DashboardRenderer` to render the Metrics page: KPIs, breakdown, token usage, agent runs, failure rate, latency and distinct IDs on every page, and scores on project pages only. The definition is frozen; copy it with `structuredClone` before customising.

```tsx
import { DashboardRenderer, METRICS_DASHBOARD } from '@mastra/playground-ui/domains/dashboards';

<DashboardRenderer definition={METRICS_DASHBOARD} scope={scope} onDrilldown={openDrilldown} />;
```
