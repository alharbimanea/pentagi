// Applied to every string sent to an AI provider. It removes direct
// identifiers; it does not make free text anonymous, which is why AI use
// also requires the customer's consent.
const PATTERNS: Array<[RegExp, string]> = [
  [/\bSA\d{2}[A-Z0-9]{20}\b/gi, "[iban]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/https?:\/\/\S+/gi, "[url]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[number]"],
  [/(?:\+|00)\d[\d\s-]{7,16}\d/g, "[phone]"],
  [/\b0?5\d{8}\b/g, "[phone]"],
  [/\b[12]\d{9}\b/g, "[national-id]"],
];

export function redact(text: string): string {
  return PATTERNS.reduce((acc, [re, label]) => acc.replace(re, label), text);
}
