/**
 * Pure page-graph logic for the schema-4 explorer: parent links plus resolved
 * mentions between loaded pages → React Flow nodes and edges, sized by
 * incoming-weighted mention degree.
 */

import type { Edge, Node } from '@xyflow/react';

import type { KnowledgePageEdge, KnowledgePagePayload } from '../pageTypes';

export const NODE_SIZE_MIN = 52;
export const NODE_SIZE_MAX = 176;
/** Unreferenced pages render as small dots. */
export const NODE_SIZE_DOT = 26;
/** Being pointed AT is what importance means: incoming counts double. */
const INCOMING_WEIGHT = 2;

export interface NodeDegree {
  incoming: number;
  outgoing: number;
}

export function weightedDegree(degree: NodeDegree): number {
  return INCOMING_WEIGHT * degree.incoming + degree.outgoing;
}

/**
 * The most-mentioned page in view anchors NODE_SIZE_MAX and the rest scale with
 * their weighted degree; pages nothing mentions are fixed-size dots.
 */
export function nodeSize(degree: NodeDegree, maxWeighted: number): number {
  if (degree.incoming < 1) return NODE_SIZE_DOT;
  if (maxWeighted <= 0) return NODE_SIZE_MIN;
  const ratio = Math.min(1, weightedDegree(degree) / maxWeighted);
  return Math.round(NODE_SIZE_MIN + (NODE_SIZE_MAX - NODE_SIZE_MIN) * ratio);
}

function degreeMap(edges: Array<{ source: string; target: string }>): Map<string, NodeDegree> {
  const degrees = new Map<string, NodeDegree>();
  const of = (id: string): NodeDegree => {
    let entry = degrees.get(id);
    if (!entry) {
      entry = { incoming: 0, outgoing: 0 };
      degrees.set(id, entry);
    }
    return entry;
  };
  for (const edge of edges) {
    of(edge.source).outgoing += 1;
    of(edge.target).incoming += 1;
  }
  return degrees;
}

/**
 * Edges among loaded, live pages: a parent edge for every loaded parent, and
 * the given mention edges merged per source → target (counts summed). Self
 * mentions and edges to unloaded pages are dropped.
 */
export function pageGraphEdges(
  pages: KnowledgePagePayload[],
  mentionEdges: KnowledgePageEdge[] = [],
): KnowledgePageEdge[] {
  const live = new Set(pages.filter(page => !page.deletedAt && !page.mergedInto).map(page => page.id));
  const edges: KnowledgePageEdge[] = [];
  for (const page of pages) {
    if (live.has(page.id) && page.parentId && page.parentId !== page.id && live.has(page.parentId)) {
      edges.push({ source: page.parentId, target: page.id, kind: 'parent' });
    }
  }
  const mentions = new Map<string, KnowledgePageEdge>();
  for (const edge of mentionEdges) {
    if (edge.kind !== 'mention' || edge.source === edge.target) continue;
    if (!live.has(edge.source) || !live.has(edge.target)) continue;
    const key = `${edge.source}\u0000${edge.target}`;
    const existing = mentions.get(key);
    const count = edge.count ?? 1;
    if (existing) existing.count = (existing.count ?? 1) + count;
    else mentions.set(key, { source: edge.source, target: edge.target, kind: 'mention', count });
  }
  return [...edges, ...mentions.values()];
}

export type PageFlowNode = Node<{
  page: KnowledgePagePayload;
  size: number;
  degree: NodeDegree;
  selected: boolean;
}>;

export type PageFlowEdge = Edge<{ kind: KnowledgePageEdge['kind']; count: number }>;

/** Converts pages and their edges to React Flow elements; positions are left to the layout. */
export function toPageFlow(
  pages: KnowledgePagePayload[],
  edges: KnowledgePageEdge[],
  selectedId?: string | null,
): { nodes: PageFlowNode[]; edges: PageFlowEdge[] } {
  // Only mentions count toward size: every non-root page has one parent, so parent edges add no signal.
  const degrees = degreeMap(edges.filter(edge => edge.kind === 'mention'));
  let maxWeighted = 0;
  for (const degree of degrees.values()) maxWeighted = Math.max(maxWeighted, weightedDegree(degree));
  const nodes = pages
    .filter(page => !page.deletedAt && !page.mergedInto)
    .map((page): PageFlowNode => {
      const degree = degrees.get(page.id) ?? { incoming: 0, outgoing: 0 };
      return {
        id: page.id,
        type: 'page',
        position: { x: 0, y: 0 },
        data: { page, size: nodeSize(degree, maxWeighted), degree, selected: page.id === selectedId },
      };
    });
  return {
    nodes,
    edges: edges.map(
      (edge): PageFlowEdge => ({
        id: `${edge.kind}:${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        data: { kind: edge.kind, count: edge.count ?? 1 },
      }),
    ),
  };
}
