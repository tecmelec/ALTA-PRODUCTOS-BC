/**
 * Quita tildes y diéresis (Á→A, É→E, Ü→U, À→A…) pero conserva la Ñ,
 * que es una letra propia y no un acento (AÑO no debe quedar como ANO).
 * Las descripciones de los artículos se guardan siempre sin acentos.
 */
export function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/([Nn])\u0303|[\u0300-\u036f]/g, (match, n) => (n ? match : ''))
    .normalize('NFC');
}
