import type {
  Geschlecht,
  Kommune,
  Mandatstraeger,
  ManualRecipient,
  Recipient,
} from '../types';
import { isKommune, isMandat, isNetzbetreiber } from './recipientTypes';

/** Wählt die geschlechtsbezogene Rollenform; ohne Angabe die neutrale Form. */
function pickRole(
  sex: Geschlecht | undefined,
  female: string,
  male: string,
  neutral: string,
): string {
  if (sex === 'f') return female;
  if (sex === 'm') return male;
  return neutral;
}

/** Amtsbezeichnung einer kommunalen Verwaltung, sonst Fallback nach Ebene. */
export function kommuneRole(kommune: Kommune): string {
  const amt = kommune.amt?.trim();
  if (amt) return amt;
  return kommune.ebene === 'kreis'
    ? pickRole(kommune.sex, 'Landrätin', 'Landrat', 'Landrät:in')
    : pickRole(kommune.sex, 'Bürgermeisterin', 'Bürgermeister', 'Bürgermeister:in');
}

/** Rollenbezeichnung eines Mandatsträgers. */
export function mandatRole(mandat: Mandatstraeger): string {
  if (mandat.parlament === 'landtag') {
    return pickRole(
      mandat.sex,
      'Landtagsabgeordnete',
      'Landtagsabgeordneter',
      'Landtagsabgeordnete:r',
    );
  }
  return pickRole(
    mandat.sex,
    'Bundestagsabgeordnete',
    'Bundestagsabgeordneter',
    'Bundestagsabgeordnete:r',
  );
}

/** Rollenbezeichnung eines manuell erfassten Empfängers. */
export function manualRole(recipient: ManualRecipient, recipientType?: string): string {
  const amt = recipient.amt?.trim();
  if (amt) return amt;
  switch (recipientType) {
    case 'landrat':
      return 'Landrät:in';
    case 'buergermeister':
    case 'ob':
      return 'Bürgermeister:in';
    case 'landtag':
      return 'Landtagsabgeordnete:r';
    case 'mdb':
    case 'mdb-regierung':
    case 'mdb-opposition':
      return 'Bundestagsabgeordnete:r';
    default:
      return '';
  }
}

/** Rollenbezeichnung für `{{ empfaenger.rolle }}`. */
export function recipientRole(recipient: Recipient, recipientType?: string): string {
  if (isMandat(recipient)) return mandatRole(recipient);
  if (isKommune(recipient)) return kommuneRole(recipient);
  // Netzbetreiber sind Unternehmen – keine personenbezogene Rolle.
  if (isNetzbetreiber(recipient)) return '';
  return manualRole(recipient, recipientType);
}
