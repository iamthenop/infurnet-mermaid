import type { CircuitModel } from './circuitTypes.js';

export class ScaffoldDb {
  private model: CircuitModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  setModel(model: CircuitModel): void {
    this.model = model;
  }

  getModel(): CircuitModel {
    if (!this.model) {
      throw new Error('circuitDiagram must be parsed successfully before rendering.');
    }
    return this.model;
  }
}
