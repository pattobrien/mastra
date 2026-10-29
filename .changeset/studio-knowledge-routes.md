---
'@mastra/server': minor
'@mastra/client-js': minor
---

Added read-only Knowledge routes on the Mastra server (`GET /knowledge`, `/knowledge/:knowledgeKey/tree`, `/pages/:pageId`, `/graph`, `/search`, `/activity`) and matching `listKnowledge()` / `getKnowledge(key)` methods on the JS client.

The routes are opt-in: they are not part of the default route set, so register them explicitly before they are served.

```ts
import { KNOWLEDGE_ROUTES } from '@mastra/server/server-adapter';

new Mastra({
  server: { apiRoutes: [...KNOWLEDGE_ROUTES] },
});
```

They read every scope, page and note in the instance, and are gated by a new `knowledge:read` permission, so grant it only to people who should see everything stored there. With an FGA provider configured, `GET /knowledge` lists only the instances the caller can read and the other routes answer 404 for any other instance.
