const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic / Persian digits to ASCII digits. */
export function digitsToAscii(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : PERSIAN.indexOf(d));
  });
}

/** Converts ASCII digits to Arabic-Indic digits for display. */
export function toArabicDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/**
 * Normalises OCR output for matching: unifies alef/yaa/taa-marbuta forms,
 * strips diacritics and tatweel, converts digits to ASCII, collapses
 * punctuation noise. The result is only used for matching; the raw text is
 * kept alongside for display.
 */
export function normalizeArabic(input: string): string {
  let s = (input ?? '').normalize('NFKC');
  s = digitsToAscii(s);
  s = s.replace(TASHKEEL, '');
  s = s.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  s = s.replace(/[\\⁄∕∕⁄]/g, '/');
  s = s.replace(/[–—−ـ]/g, '-');
  // ':' and '.' are kept: they carry time patterns (07:16, 10.00) that the parser strips later.
  s = s.replace(/[،,؛;·•|_'"“”«»()[\]{}<>«»?!؟*+=~^`]/g, ' ');
  s = s.replace(/[^\S\n]+/g, ' ');
  s = s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return s.trim();
}

export function lettersOnly(s: string): string {
  return s.replace(/[^ء-يa-zA-Z]/g, '');
}

export function hasContent(s: string): boolean {
  return /[ء-يa-zA-Z0-9]/.test(s);
}

export function tokens(s: string): string[] {
  return s
    .split(/[\s/-]+/)
    .map((t) => t.replace(/^[.:،؛]+|[.:،؛]+$/g, ''))
    .filter(Boolean);
}
