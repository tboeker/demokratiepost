/**
 * Marker für alle Eingabefelder der App.
 *
 * Die App hat weder Login noch Passwortfelder. Ohne diese Marker bieten
 * Passwort-Manager (Bitwarden, 1Password, LastPass, Proton Pass, Dashlane …)
 * ihr Inline-Menü über jedem Eingabefeld an. Die Attribute sagen den
 * Passwort-Managern, dass hier nichts zu speichern oder zu ergänzen ist.
 *
 * Verwendet auf **allen** Eingabefeldern (Absender, PLZ-Suche, Empfänger,
 * Kopierfelder) – auch auf den Adressfeldern, damit dort keine fremden
 * Identitäten eingesetzt werden. Browser können Autofill je nach Implementierung
 * trotzdem anbieten; die Passwort-Manager-Marker greifen unabhängig davon.
 */
export const noAutofill = {
  autoComplete: 'off',
  'data-bwignore': 'true', // Bitwarden
  'data-1p-ignore': 'true', // 1Password
  'data-lpignore': 'true', // LastPass
  'data-protonpass-ignore': 'true', // Proton Pass
  'data-form-type': 'other', // Dashlane und andere
} as const;
