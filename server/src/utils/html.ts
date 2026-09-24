// Empty paragraphs (optionally holding a <br>) and whitespace: what a rich text editor leaves when nothing was written.
const HTML_VACIO = /^(\s|<p>(<br\s*\/?>)?<\/p>)*$/i;

/**
 * Rich text fields are stored as NULL when they carry no content, so "has a detail?" checks stay honest.
 * undefined is kept as is: in a PATCH it means "leave the field alone".
 */
export function sinHtmlVacio(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined || valor === null) return valor;
  return HTML_VACIO.test(valor) ? null : valor;
}
