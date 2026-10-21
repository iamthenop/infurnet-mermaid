import type { ExternalDiagramDefinition } from 'mermaid';
import { ScaffoldDb } from './db.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

export const renderer: DiagramDefinition['renderer'] = {
  draw(_text, id, _version, diagram) {
    if (!(diagram.db instanceof ScaffoldDb)) {
      throw new Error('Expected the circuitDiagram scaffold database.');
    }
    diagram.db.getModel();
    const svg = document.getElementById(id);
    if (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg') {
      throw new Error('Mermaid did not supply an SVG rendering context.');
    }
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
  },
};
