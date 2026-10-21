import { describe, expect, it } from 'vitest';
import circuitDiagram from '../src/index.js';
import { createDiagram } from '../src/diagram-definition.js';
import { ScaffoldDb } from '../src/db.js';
import { createParser } from '../src/parser.js';

describe('header-only diagram', () => {
  it('loads Mermaid-compatible interfaces', async () => {
    const { id, diagram } = await circuitDiagram.loader();
    expect(id).toBe('circuitDiagram');
    expect(diagram.db.clear).toBeTypeOf('function');
    expect(diagram.parser.parse).toBeTypeOf('function');
    expect(diagram.renderer.draw).toBeTypeOf('function');
    expect(() => diagram.parser.parse('circuitDiagram')).not.toThrow();
  });

  it.each(['circuitDiagram', '\n%% comment\ncircuitDiagram\n', 'circuitDiagram\n%% ignored\n', 'circuitDiagram %% comment\n'])('accepts %j', (text) => {
    const db = new ScaffoldDb();
    createParser(db).parse(text);
    expect(db.getModel()).toEqual({ kind: 'empty' });
  });

  it.each(['', 'flowchart', 'circuitDiagramExtra', 'circuitDiagram R1', 'circuitDiagram\nR1 resistor', 'circuitDiagram\ncircuitDiagram'])('rejects unsupported input %j', (text) => {
    expect(() => createDiagram().parser.parse(text)).toThrow(/header|Unsupported circuit statement/u);
  });

  it('clears successful parse state after rejection and on explicit reset', () => {
    const db = new ScaffoldDb();
    const parser = createParser(db);
    parser.parse('circuitDiagram');
    expect(() => parser.parse('circuitDiagram\nA --> B')).toThrow('line 2');
    expect(() => db.getModel()).toThrow('parsed successfully');
    parser.parse('circuitDiagram');
    db.clear();
    expect(() => db.getModel()).toThrow('parsed successfully');
  });

  it('keeps independently created databases isolated', () => {
    const first = new ScaffoldDb();
    const second = new ScaffoldDb();
    createParser(first).parse('circuitDiagram');
    expect(() => second.getModel()).toThrow();
    expect(first.getModel()).toEqual({ kind: 'empty' });
  });
});
