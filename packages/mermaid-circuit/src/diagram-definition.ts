import type { ExternalDiagramDefinition } from 'mermaid';
import { ScaffoldDb } from './db.js';
import { createParser } from './parser.js';
import { renderer } from './renderer.js';
import { styles } from './circuitStyles.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

export function createDiagram(): DiagramDefinition {
  const db = new ScaffoldDb();
  return { db, parser: createParser(db), renderer, styles };
}

export const diagram = createDiagram();
