---
'@mastra/playground-ui': patch
---

Added `KnowledgePageTree`, `KnowledgePageDetail` and `KnowledgePageGraph` to the Knowledge explorer. The graph draws scopes and pages with their parent links and mentions, and marks pinned pages. It fits the pages into view once every page is measured and again whenever the graph gets a new size, so it stays readable on a cold load, when a host shows it from behind a toggle, and when the window is resized. Names of small pages sit under their circle instead of being clipped inside it. The tree nests scopes and pages in stored order, opens the path to a page selected elsewhere (graph or search), and supports arrow-key navigation. The detail pane shows a page's home scope, synopsis, body, pin audience and notes, with each note's stamped scopes and author and links for resolved `[[mentions]]`.
