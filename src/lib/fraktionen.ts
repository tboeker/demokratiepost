/**
 * Zuordnung der Bundestagsfraktionen zu Regierung und Opposition.
 *
 * Grundlage ist die Koalition der 21. Wahlperiode (Stand Oktober 2026):
 * CDU/CSU und SPD tragen die Bundesregierung. Nach einem Koalitionswechsel
 * müssen die Listen hier angepasst werden – sie sind bewusst an einer Stelle
 * gebündelt, damit die Empfängertypen `mdb-regierung` und `mdb-opposition`
 * ohne weitere Code-Änderung mitziehen.
 *
 * Fraktionslose gehören keiner Fraktion an und werden weder der Regierung noch
 * der Opposition zugeordnet; sie erscheinen nur beim allgemeinen Typ `mdb`.
 */

/** Fraktionen, die die Bundesregierung tragen. */
export const REGIERUNGSFRAKTIONEN = ['CDU/CSU', 'SPD'] as const;

/** Fraktionen, die die Opposition bilden. */
export const OPPOSITIONSFRAKTIONEN = [
  'AfD',
  'Bündnis 90/Die Grünen',
  'Die Linke',
] as const;

const regierung = new Set<string>(REGIERUNGSFRAKTIONEN);
const opposition = new Set<string>(OPPOSITIONSFRAKTIONEN);

/** true, wenn die Partei/Fraktion die Bundesregierung trägt. */
export function istRegierungsfraktion(party: string): boolean {
  return regierung.has(party.trim());
}

/** true, wenn die Partei/Fraktion zur Opposition gehört. */
export function istOppositionsfraktion(party: string): boolean {
  return opposition.has(party.trim());
}
