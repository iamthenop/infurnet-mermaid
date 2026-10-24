import type { ExternalDiagramDefinition } from 'mermaid';
import { ScaffoldDb } from './db.js';
import { layoutCircuit } from './drawing/layout.js';
import { routeCircuit } from './drawing/routing.js';
import { resolveSymbol } from './drawing/symbols.js';
import type { Bounds, Point } from './drawing/geometry.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];
const namespace = 'http://www.w3.org/2000/svg';

function element<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(namespace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  parent.append(node);
  return node;
}

function label(parent: Element, value: string, point: Point, attributes: Record<string, string | number> = {}): void {
  const text = element(parent, 'text', { x: point[0], y: point[1], fill: 'black', stroke: 'none', 'font-size': 14,
    'font-family': 'sans-serif', ...attributes });
  value.split(/<br\s*\/?\s*>/iu).forEach((line, index) => {
    element(text, 'tspan', { x: point[0], dy: index ? 17 : 0 }).textContent = line;
  });
}

function frame(parent: Element, box: Bounds, name: string | null, attributes: Record<string, string | number>): void {
  element(parent, 'rect', { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY,
    fill: 'none', stroke: '#777', 'stroke-width': 1, ...attributes });
  if (name) label(parent, name, [box.minX + 5, box.minY - 5], { 'font-size': 12 });
}

export const renderer: DiagramDefinition['renderer'] = {
  draw(_text, id, _version, diagram) {
    if (!(diagram.db instanceof ScaffoldDb)) throw new Error('Expected the circuitDiagram scaffold database.');
    const model = diagram.db.getModel();
    const layout = layoutCircuit(model);
    const routing = routeCircuit(model, layout);
    const svg = document.getElementById(id);
    if (!svg || svg.namespaceURI !== namespace) throw new Error('Mermaid did not supply an SVG rendering context.');
    const content = element(svg, 'g', { 'data-circuit': 'drawing' });
    const frames = element(content, 'g', { 'data-layer': 'frames' });
    for (const block of layout.blocks) if (block.bounds) frame(frames, block.bounds, model.blocks[block.block].name, { 'data-block': block.block });
    for (const stage of layout.stages) frame(frames, stage.bounds, model.stages[stage.stage].name, { 'data-stage': stage.stage, 'stroke-dasharray': '6 4' });
    const wires = element(content, 'g', { fill: 'none', stroke: 'black', 'stroke-width': 2, 'stroke-linecap': 'round', 'data-layer': 'wires' });
    for (const net of routing.nets) {
      const group = element(wires, 'g', { 'data-net': net.net });
      for (const component of net.components) {
        const parent = layout.sectional ? element(group, 'g', { 'data-route-block': component.block ?? 'ungrouped' }) : group;
        for (const segment of component.segments) element(parent, 'path', { d: `M ${segment.a.join(' ')} L ${segment.b.join(' ')}` });
        for (const point of component.junctions) element(parent, 'circle', { cx: point[0], cy: point[1], r: 3, fill: 'black', 'data-junction': net.net });
      }
    }
    for (const crossing of routing.crossings) {
      const [x, y] = crossing.point;
      const d = crossing.horizontal ? `M ${x - 5} ${y} H ${x + 5}` : `M ${x} ${y - 5} V ${y + 5}`;
      const group = element(wires, 'g', { 'data-crossing': crossing.over, 'data-under': crossing.under });
      element(group, 'path', { d, stroke: 'white', 'stroke-width': 7, 'stroke-linecap': 'butt' });
      element(group, 'path', { d });
    }
    const artwork = element(content, 'g', { 'data-layer': 'symbols' });
    for (const [index, placed] of [...layout.devices, ...layout.nets].entries()) {
      const group = element(artwork, 'g', { transform: placed.svgTransform, 'data-symbol': placed.symbol,
        [Object.hasOwn(placed, 'stage') ? 'data-device' : 'data-net-symbol']: placed.id,
        ...('occurrence' in placed && placed.occurrence ? { 'data-occurrence': placed.occurrence, 'data-net-role': placed.role!, 'data-net-block': placed.block ?? 'ungrouped' } : {}) });
      const source = new DOMParser().parseFromString(resolveSymbol(placed.symbol).svg, 'image/svg+xml').documentElement;
      const ids = new Map([...source.querySelectorAll('[id]')].map((node, ordinal) => [node.id, `${id}-symbol-${index}-${ordinal}`]));
      for (const node of source.querySelectorAll('*')) for (const attribute of [...node.attributes]) {
        let value = attribute.value;
        if (attribute.name === 'id') value = ids.get(value)!;
        else for (const [oldId, newId] of ids) {
          value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`);
          if (value === `#${oldId}`) value = `#${newId}`;
        }
        node.setAttribute(attribute.name, value);
      }
      group.append(...[...source.childNodes].map((node) => document.importNode(node, true)));
    }
    const labels = element(content, 'g', { 'data-layer': 'labels' });
    for (const device of model.devices) {
      const placed = layout.devices.find((item) => item.id === device.id)!;
      const parameters = device.label.split(/<br\s*\/?\s*>/iu).slice(1);
      label(labels, [device.id, ...parameters].join('<br/>'), [placed.bounds.maxX - 10, placed.bounds.maxY - 12], { 'data-device-label': device.id });
      for (const connection of model.connections.filter((item) => item.device === device.id)) {
        const [x, y] = placed.terminals[connection.terminal];
        label(labels, connection.terminal, [x + 5, y - 6], { 'font-size': 10, 'data-terminal': `${device.id}:${connection.terminal}` });
      }
    }
    for (const net of model.nets) {
      if (net.implicit) continue;
      const occurrences = layout.nets.filter((item) => item.id === net.id);
      if (occurrences.length) for (const placed of occurrences) {
        const [x, y] = placed.position;
        const point: Point = placed.symbol === 'pinIn' ? [x + 78, y + 65] : placed.symbol === 'pinOut' ? [x + 42, y + 65]
          : placed.symbol === 'supplyNet' ? [x + 60, y + 26] : [x + 60, y + 104];
        label(labels, net.label, point, { 'text-anchor': 'middle', 'data-net-label': net.id,
          ...(placed.occurrence ? { 'data-occurrence-label': placed.occurrence } : {}) });
      } else {
        const route = routing.nets.find((item) => item.net === net.id)!;
        const length = (a: Point, b: Point) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
        const segment = [...route.segments].sort((a, b) => length(b.a, b.b) - length(a.a, a.b))[0];
        const vertical = segment && Math.abs(segment.a[0] - segment.b[0]) < 1e-7;
        const point = segment ? (vertical ? [segment.a[0] - 8, (segment.a[1] + segment.b[1]) / 2] : [Math.min(segment.a[0], segment.b[0]) + 8, segment.a[1] - 8]) as Point : route.attachments[0] ? [route.attachments[0].point[0] - 8, route.attachments[0].point[1] + 16] as Point : undefined;
        if (point) label(labels, net.label, point, { 'data-net-label': net.id, 'font-size': 12, 'text-anchor': vertical || !segment ? 'end' : 'start' });
      }
    }
    const box = content.getBBox();
    const padding = 20;
    svg.setAttribute('viewBox', `${box.x - padding} ${box.y - padding} ${Math.max(1, box.width + padding * 2)} ${Math.max(1, box.height + padding * 2)}`);
    svg.setAttribute('width', String(Math.max(1, box.width + padding * 2)));
    svg.setAttribute('height', String(Math.max(1, box.height + padding * 2)));
  },
};
