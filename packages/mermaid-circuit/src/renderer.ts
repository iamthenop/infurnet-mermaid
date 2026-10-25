import type { ExternalDiagramDefinition } from 'mermaid';
import { ScaffoldDb } from './db.js';
import type { CircuitModel } from './circuitTypes.js';
import { Drawing, Graphic, Wire, Dot } from './drawing/core.js';
import { floorplan } from './drawing/layout.js';
import { routeLayout } from './drawing/routing.js';
import type { Point } from './drawing/geometry.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

export interface RenderReport {
  readonly devices: number;
  readonly terminals: number;
  readonly nets: number;
  readonly proxies: number;
  readonly occurrences: number;
  readonly junctions: number;
  readonly bends: number;
  readonly crossings: number;
  readonly placementMs: number;
  readonly routingMs: number;
}
let lastReport: RenderReport | undefined;
export function getLastRenderReport(): RenderReport | undefined { return lastReport; }

function compose(model: CircuitModel) {
  const start = performance.now(), layout = floorplan(model), placedAt = performance.now();
  const routing = routeLayout(layout), routedAt = performance.now();
  for (const attachment of layout.attachments) {
    if (!routing.routes.some((route) => route.net === attachment.net && [route.points[0], route.points.at(-1)!]
      .some((point) => Math.hypot(point[0] - attachment.point[0], point[1] - attachment.point[1]) < 1e-7))) {
      throw new Error(`Routing failure: omitted ${attachment.device}.${attachment.terminal}.`);
    }
  }
  const drawing = new Drawing(), attributes: Record<string, string>[] = [];
  const add = (element: Parameters<Drawing['add']>[0], attrs: Record<string, string>) => {
    drawing.add(element); attributes.push(attrs);
  };
  const text = (content: string, at: Point, attrs: Record<string, string>) =>
    add(new Graphic([], {}, { at: [0, 0], rotation: 0, labels: [{ text: content, at }] }), { 'data-label': 'true', ...attrs });
  for (const frame of [...layout.frames].sort((a, b) => Number(a.kind === 'stage') - Number(b.kind === 'stage'))) {
    const b = frame.bounds;
    add(new Graphic([{ kind: 'polyline', points: [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY],
      [b.minX, b.maxY], [b.minX, b.minY]] }], {}, { at: [0, 0], rotation: 0, stroke: '#777', strokeWidth: 1 }),
    { [`data-${frame.kind}`]: frame.name });
    text(frame.name, [b.minX + 12, b.minY + (frame.kind === 'stage' ? -42 : 22)], { 'data-frame-label': frame.kind });
  }
  for (const route of routing.routes) add(new Wire({ at: route.points[0], to: route.points.at(-1)!, shape: route.shape }),
    { 'data-net': route.net, 'data-wire': route.shape, 'data-points': JSON.stringify(route.points) });
  for (const item of layout.devices) {
    add(item.element, { 'data-device': item.device.id, 'data-type': item.device.type, 'data-stage-index': String(item.device.stage) });
    const lines = item.device.label.split(/<br\s*\/?\s*>/iu);
    lines.forEach((line, index) => text(line, [item.pane.maxX + 12, item.pane.maxY - 16 - (lines.length - 1 - index) * 20], { 'data-device-label': item.device.id }));
    if (item.device.type === 'ic') text(item.device.id, item.placed.anchors.center, { 'data-ic-label': 'true' });
    for (const terminal of item.device.terminals) {
      const point = item.placed.anchors[terminal];
      const attached = layout.attachments.find((attachment) => attachment.device === item.device.id && attachment.terminal === terminal);
      text(terminal, [point[0] + 8, point[1] - 9], { 'data-terminal': terminal, 'data-terminal-device': item.device.id,
        'data-x': String(point[0]), 'data-y': String(point[1]), ...(attached ? { 'data-terminal-net': attached.net } : {}) });
    }
  }
  routing.occurrences.forEach((proxy, index) => {
    add(proxy.element, { 'data-net-occurrence': String(index), ...(proxy.isProxy ? { 'data-proxy': 'true' } : {}), 'data-net': proxy.net.id, 'data-type': proxy.net.type,
      'data-branches': String(proxy.branches) });
    const anchor = proxy.placed.anchors.anchor;
    const point: Point = proxy.net.type === 'supplyNet' ? [anchor[0], proxy.placed.bounds.minY - 12]
      : proxy.net.type === 'ground' ? [anchor[0], proxy.placed.bounds.maxY + 22]
        : [(proxy.placed.bounds.minX + proxy.placed.bounds.maxX) / 2, anchor[1] + 5];
    text(proxy.net.label, point, { 'data-net-label': proxy.net.id });
  });
  for (const junction of routing.junctions) add(new Dot(3, { at: junction.point }),
    { 'data-junction': 'true', 'data-net': junction.net });
  const report: RenderReport = { devices: model.devices.length, terminals: model.connections.length, nets: model.nets.length,
    proxies: routing.occurrences.filter((item) => item.isProxy).length, occurrences: routing.occurrences.length,
    junctions: routing.junctions.length, bends: routing.bends, crossings: routing.crossings,
    placementMs: placedAt - start, routingMs: routedAt - placedAt };
  return { drawing, attributes, report };
}

export const renderer: DiagramDefinition['renderer'] = {
  draw(_text, id, _version, diagram) {
    if (!(diagram.db instanceof ScaffoldDb)) {
      throw new Error('Expected the circuitDiagram scaffold database.');
    }
    lastReport = undefined;
    const result = compose(diagram.db.getModel());
    const svg = document.getElementById(id);
    if (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg') {
      throw new Error('Mermaid did not supply an SVG rendering context.');
    }
    const documentSvg = new DOMParser().parseFromString(result.drawing.toSVG(180), 'image/svg+xml');
    if (documentSvg.querySelector('parsererror')) throw new Error('The drawing core emitted invalid SVG.');
    const root = documentSvg.documentElement;
    for (const group of root.querySelectorAll('[data-drawing-index]')) {
      const attrs = result.attributes[Number(group.getAttribute('data-drawing-index'))];
      for (const [name, value] of Object.entries(attrs)) group.setAttribute(name, value);
      if (attrs['data-stage']) group.setAttribute('stroke-dasharray', '8 6');
      if (attrs['data-block']) group.setAttribute('stroke-width', '1');
      if (attrs['data-net-label'] || attrs['data-ic-label']) group.setAttribute('text-anchor', 'middle');
    }
    for (const element of root.querySelectorAll('[id]')) element.id = `${id}-${element.id}`;
    svg.replaceChildren(...[...root.childNodes].map((node) => document.importNode(node, true)));
    for (const name of ['viewBox', 'width', 'height', 'overflow']) svg.setAttribute(name, root.getAttribute(name)!);
    svg.setAttribute('font-family', 'sans-serif');
    svg.setAttribute('font-size', '14');
    lastReport = result.report;
  },
};
