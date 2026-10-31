import { type ParsedFamily, type ParsedIndividual, type Family } from './model.js';
import { validateFamily } from './validator.js';

interface Statement { text: string; line: number }

function statements(source: string): Statement[] {
  const result: Statement[] = [];
  let text = '', line = 1, start = 1, quote = '', escaped = false;
  const brackets: string[] = [];
  const flush = () => { if (text.trim()) result.push({ text: text.trim(), line: start }); text = ''; start = line; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (!text.trim() && !quote) start = line;
    if (quote) {
      text += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") { quote = c; text += c; }
    else if (c === '%' && source[i + 1] === '%') {
      while (i + 1 < source.length && source[i + 1] !== '\n') i++;
    } else if (c === '[' || c === '{') { brackets.push(c); text += c; }
    else if (c === ']' || c === '}') {
      if (brackets.pop() !== (c === ']' ? '[' : '{')) throw new Error(`Line ${line}: unmatched ${c}.`);
      text += c;
    } else if ((c === '\n' || c === ';') && !brackets.length) flush();
    else text += c;
    if (c === '\n') line++;
  }
  if (quote || brackets.length) throw new Error(`Line ${start}: unterminated label or metadata.`);
  flush();
  return result;
}

class Reader {
  offset = 0;
  constructor(readonly text: string, readonly line: number) {}
  rest(): string { return this.text.slice(this.offset); }
  space(): void { this.offset += /^\s*/u.exec(this.rest())![0].length; }
  take(value: string): boolean {
    this.space();
    if (!this.rest().startsWith(value)) return false;
    this.offset += value.length;
    return true;
  }
  fail(message: string): never { throw new Error(`Line ${this.line}: ${message}`); }
  id(): string {
    this.space();
    const match = /^[\p{L}_](?:[\p{L}\p{N}_]|-(?!->|\.->))*/u.exec(this.rest());
    if (!match) return this.fail(`expected an identifier near ${JSON.stringify(this.rest())}.`);
    this.offset += match[0].length;
    return match[0];
  }
  value(until: string): string {
    this.space();
    const quote = this.text[this.offset];
    if (quote === '"' || quote === "'") {
      this.offset++;
      let result = '';
      while (this.offset < this.text.length) {
        const c = this.text[this.offset++];
        if (c === quote) return result;
        if (c === '\\') {
          const next = this.text[this.offset++];
          if (next !== quote && next !== '\\') this.fail('only quote and backslash escapes are supported.');
          result += next;
        } else result += c;
      }
      return this.fail('unterminated quoted value.');
    }
    const start = this.offset;
    while (this.offset < this.text.length && !until.includes(this.text[this.offset])) this.offset++;
    const result = this.text.slice(start, this.offset).trim();
    if (!result) return this.fail('expected a value.');
    return result;
  }
  end(): void { this.space(); if (this.rest()) this.fail(`unsupported syntax ${JSON.stringify(this.rest())}.`); }
}

export function parseFamily(source: string): Family {
  const input = statements(source);
  if (!/^familyTree(?:\s+TB)?$/u.test(input[0]?.text ?? '')) throw new Error('Expected familyTree TB.');
  if (input[1]?.text !== 'catmode') throw new Error('Expected catmode immediately after familyTree TB.');
  const parsed: ParsedFamily = { individuals: new Map(), litters: new Map(), edges: [] };
  let litter: string | undefined;
  const individual = (id: string): ParsedIndividual => {
    let node = parsed.individuals.get(id);
    if (!node) { node = { id, classes: new Set() }; parsed.individuals.set(id, node); }
    return node;
  };
  for (const { text, line } of input.slice(2)) {
    const reader = new Reader(text, line);
    if (/^subgraph\s/u.test(text)) {
      if (litter) reader.fail('nested litters are not supported.');
      reader.take('subgraph');
      const id = reader.id();
      let label = id;
      if (reader.take('[')) { label = reader.value(']'); if (!reader.take(']')) reader.fail('expected ].'); }
      reader.end();
      if (parsed.litters.has(id)) reader.fail(`duplicate litter ${id}.`);
      parsed.litters.set(id, { id, label, offspring: new Set() });
      litter = id;
      continue;
    }
    if (text === 'end') {
      if (!litter) reader.fail('end without a litter.');
      litter = undefined;
      continue;
    }
    if (/^class\s/u.test(text)) {
      reader.take('class');
      const ids = [reader.id()];
      while (reader.take(',')) ids.push(reader.id());
      const classes = [reader.id()];
      while (reader.take(',')) classes.push(reader.id());
      reader.end();
      for (const id of ids) for (const name of classes) individual(id).classes.add(name);
      continue;
    }
    const endpoint = (): string => {
      const id = reader.id();
      let node: ParsedIndividual | undefined;
      if (reader.take('[')) {
        node = individual(id);
        const label = reader.value(']');
        if (!reader.take(']')) reader.fail('expected ].');
        if (node.label !== undefined && node.label !== label) reader.fail(`conflicting labels for ${id}.`);
        node.label = label;
      }
      let again = true;
      while (again) {
        if (reader.take(':::')) {
          node = individual(id); node.classes.add(reader.id());
        } else if (reader.take('@{')) {
          node = individual(id);
          do {
            const key = reader.id();
            if (key !== 'img' && key !== 'birth') reader.fail(`unsupported metadata ${key} on ${id}.`);
            if (!reader.take(':')) reader.fail('expected : in metadata.');
            const value = reader.value(',}');
            const property = key as 'img' | 'birth';
            if (node[property] !== undefined && node[property] !== value) reader.fail(`conflicting ${key} on ${id}.`);
            node[property] = value;
          } while (reader.take(','));
          if (!reader.take('}')) reader.fail('expected } in metadata.');
        } else again = false;
      }
      return id;
    };
    let from = endpoint();
    reader.space();
    if (!reader.rest()) {
      individual(from);
      if (litter) parsed.litters.get(litter)!.offspring.add(from);
      continue;
    }
    if (litter) reader.fail('litter subgraphs contain kitten declarations only; put relationships outside.');
    while (reader.rest().trim()) {
      const adoption = reader.take('-.->');
      if (adoption) {
        if (!reader.take('|adopt|')) reader.fail('adoption requires -.->|adopt|.');
      } else if (!reader.take('-->')) reader.fail('expected --> or -.->|adopt|.');
      const to = endpoint();
      parsed.edges.push({ source: from, target: to, adoption, line });
      from = to;
    }
  }
  if (litter) throw new Error(`Unclosed litter ${litter}.`);
  for (const edge of parsed.edges) {
    if (!parsed.litters.has(edge.source)) individual(edge.source);
    if (!parsed.litters.has(edge.target)) individual(edge.target);
  }
  return validateFamily(parsed);
}
