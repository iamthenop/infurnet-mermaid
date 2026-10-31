import { layoutFamily, type FamilyLayout, type Point } from './layout.js';
import type { Family } from './model.js';

function escape(value: string): string {
  return value.replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export function svgId(prefix: string, kind: string, source: string): string {
  const encode = (value: string) => Array.from(value).map((c) => c.codePointAt(0)!.toString(16)).join('-');
  return `ft-${encode(prefix)}-${kind}-${encode(source)}`;
}

export interface SvgOptions { readonly id?: string; readonly showLitterBounds?: boolean }

export function renderLayout(layout: FamilyLayout, options: SvgOptions = {}): string {
  const prefix = options.id ?? 'family-tree';
  const id = (kind: string, source: string) => svgId(prefix, kind, source);
  const path = (points: readonly Point[], attributes = '') => `<path d="${points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}" fill="none" ${attributes}/>`;
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" id="${escape(prefix)}" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-labelledby="${id('title', 'title')}" font-family="sans-serif" font-size="14">`,
    `<title id="${id('title', 'title')}">Cat family pedigree</title>`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
  ];
  for (const kind of ['confirmed', 'adoption']) if (layout.relationships.some((route) => route.relationship.kind === kind || kind === 'confirmed' && route.relationship.kind === 'ancestry')) {
    lines.push(`<defs><marker id="${id('arrow', kind)}" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${kind === 'adoption' ? '#7c3f99' : '#344054'}"/></marker></defs>`);
  }
  lines.push('<g stroke="#344054" stroke-width="1.6" stroke-linejoin="round">');
  for (const route of layout.relationships) {
    const edge = route.relationship;
    const dashed = edge.kind === 'candidate' || edge.kind === 'adoption';
    const marker = edge.kind === 'adoption' || edge.kind === 'confirmed' || edge.kind === 'ancestry' ? `marker-end="url(#${id('arrow', edge.kind === 'ancestry' ? 'confirmed' : edge.kind)})"` : '';
    const span = edge.kind === 'ancestry' ? ` data-generation-span="${edge.span.kind === 'unknown' ? 'unknown' : edge.span.generations}"` : '';
    lines.push(`<g id="${id('relationship', edge.id)}" data-kind="${edge.kind}" data-source="${escape(edge.source)}" data-target="${escape(edge.target)}"${span}${dashed ? ' stroke-dasharray="6 5"' : ''}${edge.kind === 'adoption' ? ' stroke="#7c3f99"' : ''}>`, path(route.points, marker), '</g>');
    if (route.label) lines.push(`<text x="${route.label.x}" y="${route.label.y}" stroke="none" fill="#7c3f99" font-size="12">adopt</text>`);
  }
  for (const item of layout.litters) {
    const { litter, junction, rail } = item;
    lines.push(`<g id="${id('litter', litter.id)}" data-litter="${escape(litter.id)}"><title>${escape(litter.label)}</title>`,
      path([junction, { x: junction.x, y: rail[0].y }], 'data-stem="true"'), path(rail, 'data-rail="true"'),
      `<circle data-junction="true" cx="${junction.x}" cy="${junction.y}" r="3" fill="#344054"/>`);
    for (const drop of item.drops) lines.push(path(drop.points, `data-offspring="${escape(drop.child)}"`));
    if (options.showLitterBounds) {
      const children = layout.individuals.filter((node) => litter.offspring.includes(node.individual.id));
      const left = Math.min(rail[0].x - 24, ...children.map((node) => node.x - node.width / 2 - 16));
      const right = Math.max(rail[1].x + 24, ...children.map((node) => node.x + node.width / 2 + 16));
      const bottom = Math.max(rail[0].y + 24, ...children.map((node) => node.bottom + 16));
      lines.push(`<rect data-litter-boundary="true" x="${left}" y="${junction.y - 10}" width="${right - left}" height="${bottom - junction.y + 10}" rx="8" fill="none" stroke="#98a2b3" stroke-dasharray="3 5"/>`);
    }
    lines.push('</g>');
  }
  lines.push('</g>');
  for (const node of layout.individuals) {
    const { individual, x, y, width } = node;
    lines.push(`<g id="${id('individual', individual.id)}" data-individual="${escape(individual.id)}" data-generation="${node.generation}" data-classes="${escape(individual.classes.join(' '))}">`,
      `<title>${escape(individual.label)}${individual.unknownFor ? ` (unknown queen for ${escape(individual.unknownFor)})` : ''}</title>`);
    if (individual.img) {
      const clip = id('portrait', individual.id), radius = width / 2;
      lines.push(`<defs><clipPath id="${clip}"><circle cx="${x}" cy="${y - radius}" r="${radius}"/></clipPath></defs>`,
        `<image data-portrait="true" href="${escape(individual.img)}" x="${x - radius}" y="${y - width}" width="${width}" height="${width}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`);
    }
    lines.push(`<rect data-nameplate="true" x="${x - width / 2}" y="${y - 18}" width="${width}" height="36" rx="9" fill="#f8fafc" stroke="#344054" stroke-width="1.6"/>`,
      `<text x="${x}" y="${y}" dominant-baseline="central" text-anchor="middle" fill="#182230">${escape(individual.label)}</text>`);
    const symbol = individual.classification === 'queen' ? '♀' : individual.classification === 'tom' ? '♂' : undefined;
    if (symbol) lines.push(`<text data-sex="${individual.classification}" x="${x + width / 2 + 12}" y="${y}" dominant-baseline="central" text-anchor="middle" font-size="18" fill="#344054">${symbol}</text>`);
    lines.push('</g>');
  }
  lines.push('</svg>');
  return lines.join('\n');
}

export function renderFamily(family: Family, options: SvgOptions = {}): string {
  return renderLayout(layoutFamily(family), options);
}
