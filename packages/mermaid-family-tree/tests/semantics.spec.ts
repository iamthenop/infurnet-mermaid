/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseFamily } from '../src/parser.js';
import { parentage } from '../src/validator.js';

const parse = (body: string) => parseFamily(`familyTree TB\ncatmode\n${body}`);
const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
const fixture = (name: string) => parseFamily(fixtures[`../examples/fixtures/${name}.mmd`]);

describe('catmode identities and biological relationships', () => {
  it('preserves all five litters, shared parents, and candidate paternity in the colony', () => {
    const family = fixture('colony');
    expect(family.litters.map((litter) => litter.offspring.length)).toEqual([4, 2, 4, 4, 3]);
    expect(family.individuals).toHaveLength(22);
    expect(family.individuals.filter((node) => node.id === 'Chloe')).toHaveLength(1);
    expect(family.litters.slice(3).map((litter) => [litter.queen, ...litter.candidateSires])).toEqual([
      ['Maybelle', 'Sancho'], ['Maybelle', 'Sancho'],
    ]);
    expect(family.litters[1].candidateSires).toEqual(['Ruben', 'UnknownSire']);
    expect(family.relationships.filter((edge) => edge.kind === 'confirmed')).toEqual([]);
    expect([...parentage(family).get('Braus')!]).toEqual(['Chloe']);
  });

  it('creates distinct unknown queens, keeps explicit unknown sires by ID, and allows empty litters', () => {
    const family = fixture('unknown-queens');
    expect(new Set(family.litters.map((litter) => litter.queen)).size).toBe(2);
    expect(family.individuals.filter((node) => node.unknownFor)).toHaveLength(2);
    expect(family.litters.map((litter) => litter.candidateSires)).toEqual([['Unknown'], ['Unknown']]);
    const empty = parse('subgraph Empty\nend');
    expect(empty.litters[0]).toMatchObject({ offspring: [], candidateSires: [], queen: '@unknown-queen:Empty' });
    expect(parse('A["Unknown"]:::tom\nB["Unknown"]:::tom').individuals).toHaveLength(2);
  });

  it('confirms one kitten without asserting paternity for its siblings; adoption changes neither', () => {
    const family = fixture('confirmed-adoption');
    const biological = parentage(family), possible = parentage(family, true);
    expect([...biological.get('Braus')!].sort()).toEqual(['Rose', 'Stanley']);
    expect([...possible.get('Braus')!].sort()).toEqual(['Rose', 'Stanley']);
    expect([...biological.get('Jimmy')!]).toEqual(['Rose']);
    expect([...possible.get('Jimmy')!].sort()).toEqual(['Rose', 'Ruben', 'Stanley']);
    expect(family.relationships.find((edge) => edge.kind === 'adoption')).toMatchObject({ source: 'Han', target: 'Braus' });
  });

  it('accepts adoption loops independently of ancestry and preserves identity across repeated declarations', () => {
    const family = parse('A:::queen\nB:::tom\nA-.->|adopt|B\nB-.->|adopt|A\nA["Ada"]\nA["Ada"]');
    expect(family.individuals).toHaveLength(2);
    expect([...parentage(family).values()].every((parents) => parents.size === 0)).toBe(true);
  });

  it('uses individual maternity over a litter-specific unknown only for that child', () => {
    const family = parse('Q:::queen\nsubgraph L\nA\nB\nend\nQ-->A');
    expect([...parentage(family).get('A')!]).toEqual(['Q']);
    expect([...parentage(family).get('B')!]).toEqual(['@unknown-queen:L']);
  });

  it('does not turn a cycle of uncertain choices into asserted biological ancestry', () => {
    const family = parse('A:::tom\nB:::tom\nsubgraph L1\nA\nend\nsubgraph L2\nB\nend\nA-->L2\nB-->L1');
    expect(parentage(family).get('A')!.has('B')).toBe(false);
    expect(parentage(family).get('B')!.has('A')).toBe(false);
  });
});

describe('Mermaid-style notation', () => {
  it('accepts classes, attributes, comments, semicolons, Unicode, and compact edges', () => {
    const family = parse(`%% comment\nQ["Qu;een %% label"]; T; class Q queen; class T tom
      subgraph L["A litter"]
        K["Fräulein Bräuß"]@{
          img: 'cat.svg', birth: "2025-06"
        }:::queen
      end
      Q-->L; T-->L; Q-->K`);
    expect(family.individuals.find((node) => node.id === 'K')).toMatchObject({ label: 'Fräulein Bräuß', img: 'cat.svg', birth: '2025-06', classification: 'queen' });
    expect(family.individuals.find((node) => node.id === 'Q')!.label).toBe('Qu;een %% label');
    expect(family.relationships).toHaveLength(3);
  });

  it('deduplicates repeated edges and produces the same semantic graph after declaration reordering', () => {
    expect(parse('Q:::queen\nK\nQ-->K\nQ-->K')).toEqual(parse('Q-->K\nK\nQ:::queen'));
  });

  it.each([
    ['Q:::queen\nQ2:::queen\nsubgraph L\nK\nend\nQ-->L\nQ2-->L', /Multiple queens.*L/u],
    ['subgraph L1\nK\nend\nsubgraph L2\nK\nend', /K.*multiple birth litters/u],
    ['A:::queen\nB:::queen\nA-->B\nB-->A', /Biological ancestry cycle.*A.*B/u],
    ['A:::tom\nA-->A', /Biological ancestry cycle.*A/u],
    ['A:::queen\nsubgraph L\nA\nend\nA-->L', /Biological ancestry cycle/u],
    ['A:::queen\nB:::tom\nA-->B\nsubgraph L\nA\nend\nB-->L', /candidate ancestry/u],
    ['P-->K', /parent P requires/u],
    ['A:::queen:::tom', /Ambiguous.*A/u],
    ['A@{birth: "2025-02-29"}', /Invalid birth date/u],
    ['A@{birth: "2024-13"}', /Invalid birth date/u],
    ['A@{birth: "yesterday"}', /Invalid birth metadata/u],
    ['A@{img: "javascript:alert(1)"}', /Invalid portrait/u],
    ['A@{unknown: "x"}', /unsupported metadata/u],
    ['subgraph L\nK', /Unclosed litter/u],
    ['end', /end without/u],
    ['Q:::queen\nQ-.->K', /adoption requires/u],
    ['subgraph L\nK\nend\nL-->K', /litter L cannot/u],
    ['A["one"]\nA["two"]', /conflicting labels/u],
  ])('rejects invalid input with an identifying diagnostic: %s', (source, message) => {
    expect(() => parse(source)).toThrow(message);
  });

  it.each(['2024-02-29', '2025', '2025-06', '2025-06-01'])('accepts birth precision %s', (birth) => {
    expect(parse(`A@{birth: "${birth}"}`).individuals[0].birth).toBe(birth);
  });

  it.each(['familyTree TB\nA', 'familyTree LR\ncatmode', 'flowchart TB\ncatmode', 'familyTreeExtra\ncatmode'])('requires native activation: %s', (source) => {
    expect(() => parseFamily(source)).toThrow(/Expected/u);
  });
});
