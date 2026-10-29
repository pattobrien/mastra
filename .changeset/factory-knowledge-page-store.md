---
'@mastra/factory': patch
'mastra': patch
---

The Knowledge page works again on the page store. It shows the project's Knowledge as a page tree and graph with the selected page's notes, the same explorer Studio uses. Members see their organization's and the project's pages, never another project's or a session's. The deploying app's Knowledge must declare `project:$projectId` scopes (as Factory session runs already need); without them the page reports a configuration error instead of guessing what to show.
