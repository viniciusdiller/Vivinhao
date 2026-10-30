const COMBINING_DIACRITICS_START = 0x0300;
const COMBINING_DIACRITICS_END = 0x036f;
const COMBINING_DIACRITICS = new RegExp(
  `[\\u${COMBINING_DIACRITICS_START.toString(16).padStart(4, '0')}-\\u${COMBINING_DIACRITICS_END.toString(16).padStart(4, '0')}]`,
  'g',
);

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export async function generateUniqueTenantSlug(
  name: string,
  slugExists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || 'pousada';
  let candidate = base;
  let attempt = 1;

  while (await slugExists(candidate)) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }

  return candidate;
}
