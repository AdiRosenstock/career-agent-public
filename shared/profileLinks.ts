/** Public work links must be safe to paste into an employer application. */
export function validProfileLinkUrl(value: string): boolean {
 try {
  const url = new URL(value);
  return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash;
 } catch { return false; }
}
