import type { ScaffoldDb } from './db.js';
import { parseCircuit } from './parser/circuitParser.js';

export function createParser(db: ScaffoldDb) {
  return {
    parse(text: string): void {
      db.clear();
      db.setModel(parseCircuit(text));
    },
  };
}
