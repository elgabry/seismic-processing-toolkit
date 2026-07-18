import type { TraceBlock } from "../../core/model/trace";
import type { ProcessingContext } from "../api/processor";
import { ProcessorRegistry } from "./processor-registry";
import type { ProcessingGraph } from "./processing-graph";
/** Executes enabled linear graph nodes against a bounded block; DAG fan-in is reserved for future processors. */
export class PipelineExecutor {
  public constructor(private readonly registry: ProcessorRegistry) {}
  public async execute(block: TraceBlock, graph: ProcessingGraph, context: ProcessingContext): Promise<TraceBlock> { let current = block; for (const node of graph.ordered()) { if (!node.enabled) continue; if (node.inputNodeIds.length > 1) throw new Error("Phase 1 PipelineExecutor does not yet execute fan-in graph nodes."); const processor = this.registry.get(node.processorId); const input = { traceCount: current.traceIds.length, maximumSamplesPerTrace: this.maximumSamples(current), sampleIntervalSeconds: current.sampleIntervalSeconds }; const issues = processor.validate(input, node.parameters); const error = issues.find((item) => item.severity === "error"); if (error) throw new Error(`${processor.displayName}: ${error.message}`); current = await processor.processBlock(current, node.parameters, context); } return current; }
  private maximumSamples(block: TraceBlock): number { let maximum = 0; for (let index = 0; index < block.traceIds.length; index += 1) maximum = Math.max(maximum, (block.sampleOffsets[index + 1] ?? 0) - (block.sampleOffsets[index] ?? 0)); return maximum; }
}
