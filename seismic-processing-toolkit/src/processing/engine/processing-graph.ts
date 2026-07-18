export interface ProcessingGraphNode { readonly nodeId: string; readonly processorId: string; readonly version: string; readonly parameters: unknown; readonly enabled: boolean; readonly inputNodeIds: readonly string[]; readonly createdAt: string; readonly label?: string; }
/** JSON-safe provenance graph; data are never embedded in graph JSON. */
export class ProcessingGraph {
  private readonly nodes = new Map<string, ProcessingGraphNode>();
  public add(node: ProcessingGraphNode): void { if (this.nodes.has(node.nodeId)) throw new Error(`Processing node ${node.nodeId} already exists.`); this.nodes.set(node.nodeId, { ...node, inputNodeIds: [...node.inputNodeIds] }); }
  public remove(nodeId: string): void { if ([...this.nodes.values()].some((node) => node.inputNodeIds.includes(nodeId))) throw new Error(`Cannot remove ${nodeId}; it is used by another processing node.`); this.nodes.delete(nodeId); }
  public ordered(): readonly ProcessingGraphNode[] { return [...this.nodes.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)); }
  public toJSON(): readonly ProcessingGraphNode[] { return this.ordered(); }
  public static fromJSON(nodes: readonly ProcessingGraphNode[]): ProcessingGraph { const graph = new ProcessingGraph(); for (const node of nodes) graph.add(node); return graph; }
}
