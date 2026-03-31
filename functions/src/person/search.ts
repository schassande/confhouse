/**
 * Compute the person `search` field:
 * lastName, firstName, email, speaker.company (lowercase, space-separated).
 * Mirrors frontend PersonService behavior.
 */
export function computePersonSearchField(person: any): string {
  const parts: string[] = [];
  if (person?.lastName) parts.push(String(person.lastName).toLowerCase());
  if (person?.firstName) parts.push(String(person.firstName).toLowerCase());
  if (person?.email) parts.push(String(person.email).toLowerCase());
  if (person?.speaker?.company) parts.push(String(person.speaker.company).toLowerCase());
  return parts.join(' ');
}
