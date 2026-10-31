import { expect, it } from 'vitest';
import familyTree from '../src/index.js';
import { createDiagram, FamilyDb } from '../src/diagram.js';

it('registers a native Mermaid diagram with the approved declaration', async () => {
  const loaded = await familyTree.loader();
  expect(loaded.id).toBe('familyTree');
  expect(familyTree.detector('familyTree TB')).toBe(true);
  expect(familyTree.detector('familyTreeExtra TB')).toBe(false);
  expect(familyTree.detector('flowchart TB\n%% family-tree catmode')).toBe(false);
  expect(loaded.diagram.renderer.draw).toBeTypeOf('function');
});

it('isolates databases and clears state after invalid input', () => {
  const first = createDiagram(), second = createDiagram();
  first.parser.parse('familyTree TB\ncatmode\nA');
  expect((first.db as FamilyDb).getFamily().individuals[0].id).toBe('A');
  expect(() => (second.db as FamilyDb).getFamily()).toThrow('parsed successfully');
  expect(() => first.parser.parse('familyTree TB\ncatmode\nA-->A')).toThrow();
  expect(() => (first.db as FamilyDb).getFamily()).toThrow('parsed successfully');
  first.parser.parse('familyTree TB\ncatmode');
  first.db.clear!();
  expect(() => (first.db as FamilyDb).getFamily()).toThrow('parsed successfully');
});
