---
'mastra': minor
---

Added a Knowledge page to Mastra Studio that browses a Knowledge instance registered on the server. It shows every scope and page as a tree beside a graph of the same pages, opens a selected page with its notes and pin, and searches pages and notes. On narrow screens a toggle switches between the tree and the graph.

The page needs the Knowledge routes, which are not served by default. Register them on your Mastra instance:

```ts
import { KNOWLEDGE_ROUTES } from '@mastra/server/server-adapter';

new Mastra({
  server: { apiRoutes: [...KNOWLEDGE_ROUTES] },
});
```

Until then the page explains how to enable them.
