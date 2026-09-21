import { FlowEdge, FlowNode } from "@/lib/executionEngine";

export function getRootNodeIds(nodes: FlowNode[], edges: FlowEdge[]) {
  const nodesWithParents = new Set(edges.map((edge) => edge.target));
  return nodes.filter((node) => !nodesWithParents.has(node.id)).map((node) => node.id);
}

export function getDescendantNodeIds(startNodeId: string, edges: FlowEdge[]) {
  const descendants = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) continue;

    for (const edge of edges) {
      if (edge.source !== currentNodeId || descendants.has(edge.target)) continue;
      descendants.add(edge.target);
      queue.push(edge.target);
    }
  }

  return descendants;
}
