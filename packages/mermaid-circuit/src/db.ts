export class ScaffoldDb {
  private parsed = false;

  clear(): void {
    this.parsed = false;
  }

  acceptHeader(): void {
    this.parsed = true;
  }

  getModel(): Readonly<{ kind: 'empty' }> {
    if (!this.parsed) {
      throw new Error('circuitDiagram must be parsed successfully before rendering.');
    }
    return { kind: 'empty' };
  }
}
