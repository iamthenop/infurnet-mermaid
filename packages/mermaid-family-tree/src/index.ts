import type { ExternalDiagramDefinition } from 'mermaid';

export const id = 'familyTree';
const familyTree: ExternalDiagramDefinition = {
  id,
  detector: (text) => /^\s*familyTree(?=\s|$)/u.test(text),
  async loader() { const { diagram } = await import('./diagram.js'); return { id, diagram }; },
};

export default familyTree;
export { parseFamily } from './parser.js';
export { layoutFamily } from './layout.js';
export { renderFamily } from './svg.js';
export type { Family, Individual, Litter, Relationship } from './model.js';
export type { FamilyLayout } from './layout.js';
export type { SvgOptions } from './svg.js';
