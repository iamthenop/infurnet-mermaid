import type { ExternalDiagramDefinition } from 'mermaid';
import { detector } from './detector.js';

const circuitDiagram: ExternalDiagramDefinition = {
  id: 'circuitDiagram',
  detector,
  async loader() {
    const { diagram } = await import('./diagram-definition.js');
    return { id: 'circuitDiagram', diagram };
  },
};

export default circuitDiagram;
