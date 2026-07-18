import type { SeismicProcessor } from "../api/processor";

/** Single registration point avoids UI-specific processor switches. */
export class ProcessorRegistry {
  private readonly processors = new Map<string, SeismicProcessor<unknown>>();
  public register<P>(processor: SeismicProcessor<P>): void { if (this.processors.has(processor.id)) throw new Error(`Processor ${processor.id} is already registered.`); this.processors.set(processor.id, processor); }
  public get(id: string): SeismicProcessor<unknown> { const processor = this.processors.get(id); if (!processor) throw new Error(`Unknown processor ${id}.`); return processor; }
  public all(): readonly SeismicProcessor<unknown>[] { return [...this.processors.values()]; }
}
