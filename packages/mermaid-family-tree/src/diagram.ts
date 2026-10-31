import type { ExternalDiagramDefinition } from 'mermaid';
import type { Family } from './model.js';
import { parseFamily } from './parser.js';
import { renderFamily } from './svg.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

export class FamilyDb {
  private family?: Family;
  clear(): void { this.family = undefined; }
  setFamily(family: Family): void { this.family = family; }
  getFamily(): Family {
    if (!this.family) throw new Error('familyTree must be parsed successfully before rendering.');
    return this.family;
  }
}

export function createDiagram(): DiagramDefinition {
  const db = new FamilyDb();
  return {
    db,
    parser: { parse(source: string): void { db.clear(); db.setFamily(parseFamily(source)); } },
    renderer: {
      draw(_source, id, _version, diagram) {
        if (!(diagram.db instanceof FamilyDb)) throw new Error('Expected a familyTree database.');
        const target = document.getElementById(id);
        if (!target || target.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Mermaid did not supply an SVG rendering context.');
        const parsed = new DOMParser().parseFromString(renderFamily(diagram.db.getFamily(), { id }), 'image/svg+xml');
        if (parsed.querySelector('parsererror')) throw new Error('Invalid familyTree SVG.');
        const root = parsed.documentElement;
        target.replaceChildren(...[...target.children].filter((node) => node.localName === 'style'),
          ...[...root.childNodes].map((node) => document.importNode(node, true)));
        for (const attr of [...root.attributes]) if (attr.name !== 'id' && attr.name !== 'xmlns') target.setAttribute(attr.name, attr.value);
      },
    },
    styles: () => '',
  };
}

export const diagram = createDiagram();
