import type { ExternalDiagramDefinition } from 'mermaid';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

interface ThemeOptions {
  readonly theme: string;
  readonly background: string;
  readonly lineColor: string;
  readonly primaryBorderColor: string;
  readonly primaryTextColor: string;
  readonly textColor: string;
}

export const styles: NonNullable<DiagramDefinition['styles']> = (options: ThemeOptions) => {
  if (!['default', 'dark', 'base'].includes(options.theme)) {
    throw new Error('circuitDiagram supports Mermaid themes default, dark, and base.');
  }
  const inverse = options.theme === 'dark';
  const colored = options.theme === 'base';
  const ink = inverse ? '#F2F2F2' : '#000000';
  const background = colored ? options.background : inverse ? '#101215' : '#FFFFFF';
  const wire = colored ? options.lineColor : ink;
  const device = colored ? options.primaryBorderColor : ink;
  const label = colored ? options.primaryTextColor : ink;
  const text = colored ? options.textColor : ink;
  const frame = colored ? '#777777' : ink;
  return `
    &, & svg { font-family: sans-serif; font-size: 14px; }
    & [data-circuit-background] { fill: ${background}; }
    & [data-wire] polyline { stroke: ${wire}; }
    & [data-junction] circle { stroke: ${wire}; fill: ${wire}; }
    & [data-device] [stroke]:not([stroke="none"]),
    & [data-net-occurrence] [stroke]:not([stroke="none"]) { stroke: ${device}; }
    & [data-device] [fill="#000"],
    & [data-net-occurrence] [fill="#000"] { fill: ${device}; }
    & [data-device] [fill="#fff"], & [data-device] [fill="white"],
    & [data-net-occurrence] [fill="#fff"], & [data-net-occurrence] [fill="white"] { fill: ${background}; }
    & [data-stage] polyline, & [data-block] polyline { stroke: ${frame}; }
    & [data-device-label] text, & [data-ic-label] text, & [data-terminal] text { fill: ${label}; }
    & [data-net-label] text, & [data-frame-label] text { fill: ${text}; }
  `;
};
