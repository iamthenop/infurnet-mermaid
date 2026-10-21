import type { ExternalDiagramDefinition } from 'mermaid';
import { ScaffoldDb } from './db.js';
import { createParser } from './parser.js';
import { renderer } from './renderer.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

export function createDiagram(): DiagramDefinition {
  const db = new ScaffoldDb();
  return { db, parser: createParser(db), renderer };
}

export const diagram = createDiagram();
