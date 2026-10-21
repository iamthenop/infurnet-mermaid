import type { ScaffoldDb } from './db.js';

export function createParser(db: ScaffoldDb) {
  return {
    parse(text: string): void {
      db.clear();
      const statements = text.split(/\r?\n/u)
        .map((line, index) => ({ text: line.replace(/%%.*$/u, '').trim(), line: index + 1 }))
        .filter((line) => line.text.length > 0);
      if (statements[0]?.text !== 'circuitDiagram') {
        throw new Error('Expected the header-only declaration "circuitDiagram".');
      }
      const unsupported = statements[1];
      if (unsupported) {
        throw new Error(`Unsupported circuit statement at line ${unsupported.line}: ${unsupported.text}. Only the circuitDiagram header is supported.`);
      }
      db.acceptHeader();
    },
  };
}
