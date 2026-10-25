import type { Sender } from '../types';

/**
 * Selbstbezeichnung des Absenders im Brieftext.
 * Ohne Geschlechtsangabe bleibt die bisherige neutrale Form erhalten.
 */
export function senderCitizenLabel(sender: Sender): string {
  switch (sender.geschlecht) {
    case 'f':
      return 'Bürgerin';
    case 'm':
      return 'Bürger';
    case 'd':
      return 'Bürger:in';
    default:
      return 'Bürgerin/Bürger';
  }
}

/** Kontext für `{{ absender.* }}` inklusive abgeleiteter Felder. */
export function senderContext(sender: Sender): Record<string, string> {
  return {
    name: sender.name,
    strasse: sender.strasse,
    plz: sender.plz,
    ort: sender.ort,
    email: sender.email ?? '',
    telefon: sender.telefon ?? '',
    buerger: senderCitizenLabel(sender),
  };
}
