---
'@mastra/deployer-cloud': patch
'@mastra/deployer-cloudflare': patch
'@mastra/deployer-netlify': patch
'@mastra/deployer-sandbox': patch
'@mastra/deployer-vercel': patch
'mastra': patch
'@mastra/deployer': patch
'@mastra/server': patch
'@mastra/elysia': patch
'@mastra/express': patch
'@mastra/fastify': patch
'@mastra/hono': patch
'@mastra/koa': patch
'@mastra/nestjs': patch
'@mastra/next': patch
'@mastra/tanstack-start': patch
'@mastra/temporal': patch
---

Raised the minimum `@mastra/core` version to 1.81.0. `@mastra/server` now uses the Knowledge page readers added in that release, so the server, its adapters, the deployers and the CLI all need it.
