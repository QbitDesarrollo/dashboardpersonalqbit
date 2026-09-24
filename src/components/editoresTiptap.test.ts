import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// StarterKit 3 already includes Link and Underline. A file that adds its own configured
// copy must switch the StarterKit one off, or tiptap loads both and the settings clash.
describe('editores tiptap', () => {
  const archivos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });

  it('ningún editor carga Link o Underline dos veces', () => {
    const conProblema = archivos(path.resolve(__dirname, '..')).filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      if (!/from '@tiptap\/starter-kit'/.test(s)) return false;
      const usos = s.match(/StarterKit(\.configure\(\{[\s\S]*?\}\))?(?=\s*,)/g) ?? [];
      const agregaLink = /from '@tiptap\/extension-link'/.test(s);
      const agregaUnderline = /from '@tiptap\/extension-underline'/.test(s);
      return usos.some((u) => (agregaLink && !/link:\s*false/.test(u)) || (agregaUnderline && !/underline:\s*false/.test(u)));
    }).map((f) => path.relative(path.resolve(__dirname, '..'), f));
    expect(conProblema).toEqual([]);
  });
});
