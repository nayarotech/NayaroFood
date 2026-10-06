/**
 * Page-address slug, matching the API's own rules ("Privacy Policy" →
 * "privacy-policy"). The API re-validates every slug; this is only for the
 * live suggestion while an admin types a title.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
