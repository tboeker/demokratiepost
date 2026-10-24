/**
 * Gemeinsame Definitionen für die Landtags-Datenpipeline (M4).
 *
 * Hier liegen die feste Zuordnung Parlament (abgeordnetenwatch) ↔ Bundesland
 * (OpenWahlkreisMap-Ordner) sowie kleine Helfer, die mehrere Build-Schritte
 * teilen (CSV-Parsing, Wahlkreis-Label, Konsistenzregel Wahlperiode).
 */

/**
 * Die 16 Landtage. `parliamentId` ist die abgeordnetenwatch-Id, `staat` der
 * Ordnername bei OpenWahlkreisMap (`configs/landtag/<staat>.yaml`).
 * Der Bundestag (5) und das EU-Parlament (1) gehören nicht dazu.
 */
export const LANDTAG_PARLIAMENTS = [
  { parliamentId: 2, staat: 'berlin', stateName: 'Berlin', parliament: 'Abgeordnetenhaus' },
  { parliamentId: 3, staat: 'hamburg', stateName: 'Hamburg', parliament: 'Bürgerschaft' },
  { parliamentId: 4, staat: 'nrw', stateName: 'Nordrhein-Westfalen', parliament: 'Landtag' },
  { parliamentId: 6, staat: 'baden-wuerttemberg', stateName: 'Baden-Württemberg', parliament: 'Landtag' },
  { parliamentId: 7, staat: 'rheinland-pfalz', stateName: 'Rheinland-Pfalz', parliament: 'Landtag' },
  { parliamentId: 8, staat: 'sachsen-anhalt', stateName: 'Sachsen-Anhalt', parliament: 'Landtag' },
  { parliamentId: 9, staat: 'mecklenburg-vorpommern', stateName: 'Mecklenburg-Vorpommern', parliament: 'Landtag' },
  { parliamentId: 10, staat: 'bremen', stateName: 'Bremen', parliament: 'Bürgerschaft' },
  { parliamentId: 11, staat: 'hessen', stateName: 'Hessen', parliament: 'Landtag' },
  { parliamentId: 12, staat: 'niedersachsen', stateName: 'Niedersachsen', parliament: 'Landtag' },
  { parliamentId: 13, staat: 'bayern', stateName: 'Bayern', parliament: 'Landtag' },
  { parliamentId: 14, staat: 'saarland', stateName: 'Saarland', parliament: 'Landtag' },
  { parliamentId: 15, staat: 'thueringen', stateName: 'Thüringen', parliament: 'Landtag' },
  { parliamentId: 16, staat: 'brandenburg', stateName: 'Brandenburg', parliament: 'Landtag' },
  { parliamentId: 17, staat: 'sachsen', stateName: 'Sachsen', parliament: 'Landtag' },
  { parliamentId: 18, staat: 'schleswig-holstein', stateName: 'Schleswig-Holstein', parliament: 'Landtag' },
];

/** Liefert den Eintrag zu einem OpenWahlkreisMap-Ordnernamen. */
export function landtagByStaat(staat) {
  return LANDTAG_PARLIAMENTS.find((entry) => entry.staat === staat);
}

/** Liefert den Eintrag zu einer abgeordnetenwatch-Parlaments-Id. */
export function landtagByParliamentId(parliamentId) {
  return LANDTAG_PARLIAMENTS.find((entry) => entry.parliamentId === Number(parliamentId));
}

/**
 * Einzelne Länder nummerieren ihre Wahlkreise in der OpenWahlkreisMap-Quelle
 * anders als abgeordnetenwatch. Der Wert wird auf die OWM-Nummer addiert, um
 * die API-Nummer zu erhalten. Beispiel Schleswig-Holstein: Die amtliche CSV des
 * Statistikamts Nord führt die Wahlkreise als „0101“–„0135“ (→ 101–135),
 * abgeordnetenwatch als 1–35.
 */
export const LANDTAG_WK_OFFSET = {
  'schleswig-holstein': -100,
};

/** Rechnet eine Wahlkreisnummer aus der OpenWahlkreisMap-Quelle auf die API um. */
export function normalizeWk(staat, wk) {
  return Number(wk) + (LANDTAG_WK_OFFSET[staat] ?? 0);
}

/**
 * Zerlegt ein abgeordnetenwatch-Wahlkreis-Label in Nummer und Namen.
 * "39 - Mettmann III - Mülheim II (Nordrhein-Westfalen 2022 - 2027)"
 *   → { number: 39, name: "Mettmann III - Mülheim II" }
 */
export function parseConstituency(label) {
  if (!label) return undefined;
  const match = String(label).match(/^(\d+)\s*[-–]\s*(.+?)\s*(?:\([^)]*\))?$/);
  if (!match) return undefined;
  return { number: Number(match[1]), name: match[2].trim() };
}

/**
 * Fraktions-/Parteiname ohne Wahlperioden-Zusatz.
 * "BÜNDNIS 90/­DIE GRÜNEN (Nordrhein-Westfalen 2022 - 2027)" → "BÜNDNIS 90/DIE GRÜNEN"
 */
export function cleanFraction(label) {
  if (!label) return undefined;
  const cleaned = String(label)
    .replace(/\u00ad/g, '')
    .replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, '')
    .trim();
  if (!cleaned || /^fraktionslos$/i.test(cleaned)) return undefined;
  return cleaned;
}

/** Wandelt ein Config-Feld wie "Hessen 2023" oder "NRW 2022" in ein Jahr (Zahl). */
export function electionYear(election) {
  const years = String(election ?? '').match(/\d{4}/g);
  return years ? Number(years[years.length - 1]) : undefined;
}

/**
 * Konsistenzregel: Ein Land ist nur dann durchsuchbar, wenn die laufende
 * API-Wahlperiode und die OpenWahlkreisMap-Konfiguration zusammenpassen –
 * in `period_id` **und** Label (Bundesland + Wahljahr).
 *
 * Die Id allein genügt nicht: OpenWahlkreisMap kann dieselbe Id für das
 * *Wahl*-Projekt meinen, die API für die *auslaufende* Legislatur (z. B.
 * Berlin 2026). Der Jahresvergleich toleriert, dass die Wahl im Jahr vor dem
 * Beginn der Wahlperiode lag (z. B. Hessen: Wahl 2023, Periode ab 2024).
 */
export function periodMatchesConfig(config, period) {
  if (!config || !period) return false;
  if (Number(config.period_id) !== Number(period.id)) return false;

  const label = String(period.label ?? '');
  const labelState = label.replace(/\s*\d{4}.*$/, '').trim();
  if (labelState !== config.state_name) return false;

  const years = label.match(/\d{4}/g) ?? [];
  const startYear = Number(years[0]);
  const year = electionYear(config.election);
  if (!Number.isFinite(startYear) || !year) return false;

  return startYear === year || startYear === year + 1;
}

/**
 * Wählt aus allen Wahlperioden eines Parlaments die laufende aus.
 * Bevorzugt die Periode, in der `now` liegt; sonst die zuletzt gestartete.
 */
export function currentPeriod(periods, now = new Date()) {
  const legislatures = (periods ?? [])
    .filter((period) => period.type === 'legislature' && period.start_date_period)
    .sort((a, b) => b.start_date_period.localeCompare(a.start_date_period));
  if (legislatures.length === 0) return undefined;

  const iso = now.toISOString().slice(0, 10);
  const running = legislatures.find(
    (period) => period.start_date_period <= iso && (!period.end_date_period || period.end_date_period >= iso),
  );
  return running ?? legislatures[0];
}

/**
 * Sehr einfacher CSV-Parser mit Unterstützung für Anführungszeichen (inkl.
 * verdoppelter `""` innerhalb eines Feldes). Trennzeichen ist ein Komma.
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // ignorieren
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}
