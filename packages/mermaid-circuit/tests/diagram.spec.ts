import { describe, expect, it } from 'vitest';
import circuitDiagram from '../src/index.js';
import { createDiagram } from '../src/diagram-definition.js';
import { ScaffoldDb } from '../src/db.js';
import { createParser } from '../src/parser.js';

describe('circuit diagram parser', () => {
  it('loads Mermaid-compatible interfaces', async () => {
    const { id, diagram } = await circuitDiagram.loader();
    expect(id).toBe('circuitDiagram');
    expect(diagram.db.clear).toBeTypeOf('function');
    expect(diagram.parser.parse).toBeTypeOf('function');
    expect(diagram.renderer.draw).toBeTypeOf('function');
    expect(diagram.styles).toBeTypeOf('function');
    expect(() => diagram.parser.parse('circuitDiagram D')).not.toThrow();
  });

  it.each(['circuitDiagram D', '\n%% comment\ncircuitDiagram D\n', 'circuitDiagram D\n%% ignored\n', 'circuitDiagram D %% comment\n'])('accepts %j', (text) => {
    const db = new ScaffoldDb();
    createParser(db).parse(text);
    expect(db.getModel()).toEqual(expect.objectContaining({ mode: 'D', devices: [], nets: [] }));
  });

  it.each(['', 'flowchart', 'circuitDiagramExtra', 'circuitDiagram R1', 'circuitDiagram D\nR1 resistor', 'circuitDiagram D\ncircuitDiagram'])('rejects unsupported input %j', (text) => {
    expect(() => createDiagram().parser.parse(text)).toThrow(/Expected|Unsupported circuit statement/u);
  });

  it('clears successful parse state after rejection and on explicit reset', () => {
    const db = new ScaffoldDb();
    const parser = createParser(db);
    parser.parse('circuitDiagram D');
    expect(() => parser.parse('circuitDiagram D\nA --> B')).toThrow('Line 2');
    expect(() => db.getModel()).toThrow('parsed successfully');
    parser.parse('circuitDiagram D');
    db.clear();
    expect(() => db.getModel()).toThrow('parsed successfully');
  });

  it('keeps independently created databases isolated', () => {
    const first = new ScaffoldDb();
    const second = new ScaffoldDb();
    createParser(first).parse('circuitDiagram D');
    expect(() => second.getModel()).toThrow();
    expect(first.getModel()).toEqual(expect.objectContaining({ mode: 'D', devices: [], nets: [] }));
  });
});
