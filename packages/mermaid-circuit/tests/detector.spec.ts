import { describe, expect, it, vi } from 'vitest';
import { detector } from '../src/detector.js';

describe('diagram detection', () => {
  it.each(['circuitDiagram', '  circuitDiagram\n', '\ncircuitDiagram\n%% comment'])('recognizes %j', (text) => {
    expect(detector(text)).toBe(true);
  });

  it.each(['', 'flowchart LR', 'CircuitDiagram', 'circuitDiagramOther', 'circuitDiagram_2', 'circuitDiagram-x', 'prefix circuitDiagram'])('rejects %j', (text) => {
    expect(detector(text)).toBe(false);
  });

  it('does not load the implementation until its loader is called', async () => {
    vi.resetModules();
    const load = vi.fn(() => ({ diagram: {} }));
    vi.doMock('../src/diagram-definition.js', load);
    try {
      const { default: definition } = await import('../src/index.js');
      expect(load).not.toHaveBeenCalled();
      expect(definition.id).toBe('circuitDiagram');
      await definition.loader();
      expect(load).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('../src/diagram-definition.js');
      vi.resetModules();
    }
  });
});
