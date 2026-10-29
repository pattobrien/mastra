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

What they return depends on whether the app configures auth. Without auth they read every scope, page and note in the instance. With auth they return only what the signed-in caller can read: set `MASTRA_KNOWLEDGE_PRINCIPALS_KEY` on the request context in `authorize` to the caller's Knowledge principals (or `'all'` for an admin), and a caller with no mapping is refused with 403.

```ts
import { MASTRA_KNOWLEDGE_PRINCIPALS_KEY } from '@mastra/server/server-adapter';

authorize: async (path, method, user, context) => {
  context.get('requestContext').set(MASTRA_KNOWLEDGE_PRINCIPALS_KEY, [`team:${user.orgId}:${user.teamId}`]);
  return true;
};
```

The routes are gated by a new `knowledge:read` permission. With an FGA provider configured, `GET /knowledge` lists only the instances the caller can read and the other routes answer 404 for any other instance.
