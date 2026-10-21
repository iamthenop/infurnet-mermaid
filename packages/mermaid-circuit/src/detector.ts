export const detector = (text: string): boolean => /^\s*circuitDiagram(?=\s|$)/u.test(text);
