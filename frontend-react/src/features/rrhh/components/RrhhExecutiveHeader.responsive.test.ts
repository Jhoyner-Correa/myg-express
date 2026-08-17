import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = resolve(process.cwd(), 'src/features/rrhh/components/RrhhExecutiveHeader.module.css');
const css = readFileSync(cssPath, 'utf8');

describe('RrhhExecutiveHeader responsive contract', () => {
  it('mantiene la búsqueda disponible en tamaños medianos', () => {
    const tabletRules = css.match(/@media \(max-width: 1180px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(tabletRules).toContain('.searchControl');
    expect(tabletRules).not.toMatch(/\.searchControl\s*\{[^}]*display:\s*none/);
  });

  it('lleva la búsqueda a una fila completa en móvil', () => {
    const mobileRules = css.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(mobileRules).toMatch(/\.searchControl\s*\{[^}]*order:\s*5/);
    expect(mobileRules).toMatch(/\.searchControl\s*\{[^}]*flex:\s*1 0 100%/);
  });
});
