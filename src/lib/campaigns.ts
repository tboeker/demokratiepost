import { parse } from 'yaml';
import type { Campaign, CampaignMeta, Instruction, InstructionField } from '../types';

// Alle Kampagnen-Dateien werden zur Build-Zeit eingelesen. Dadurch landen die
// Inhalte direkt im Bundle und es ist zur Laufzeit kein Server nötig.
const yamlFiles = import.meta.glob('../../campaigns/*/campaign.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const templateFiles = import.meta.glob('../../campaigns/*/templates/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Anleitungen für Empfänger, die nur ein Webformular anbieten (M7).
const instructionFiles = import.meta.glob('../../campaigns/*/instructions/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Ermittelt den Kampagnen-Ordner aus einem Glob-Pfad. */
function campaignDir(path: string): string {
  const match = path.match(/campaigns\/([^/]+)\//);
  return match ? match[1] : '';
}

/** Ermittelt den Empfängertyp aus einem Template-/Anleitungspfad. */
function recipientTypeFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.md$/, '');
}

interface InstructionFrontmatter {
  title?: unknown;
  url?: unknown;
  linkLabel?: unknown;
  fields?: Array<Partial<InstructionField>>;
}

/**
 * Zerlegt eine Anleitungsdatei in YAML-Frontmatter und Markdown-Text.
 * Fehlt der Frontmatter-Block, gilt der ganze Inhalt als Markdown.
 */
function parseInstruction(raw: string): Instruction {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return { fields: [], body: raw.trim() };
  }

  const meta = (parse(match[1]) ?? {}) as InstructionFrontmatter;
  const fields = Array.isArray(meta.fields)
    ? meta.fields.map((field) => ({
        label: String(field.label ?? ''),
        value: String(field.value ?? ''),
        multiline: Boolean(field.multiline),
        note: field.note ? String(field.note) : undefined,
      }))
    : [];

  return {
    title: meta.title ? String(meta.title) : undefined,
    url: meta.url ? String(meta.url) : undefined,
    linkLabel: meta.linkLabel ? String(meta.linkLabel) : undefined,
    fields,
    body: raw.slice(match[0].length).trim(),
  };
}

/** Lädt alle Kampagnen aus dem `campaigns/`-Ordner. */
export function loadCampaigns(): Campaign[] {
  const campaigns: Campaign[] = [];

  for (const [yamlPath, raw] of Object.entries(yamlFiles)) {
    const dir = campaignDir(yamlPath);
    const meta = parse(raw) as CampaignMeta;

    const templates: Record<string, string> = {};
    for (const [templatePath, content] of Object.entries(templateFiles)) {
      if (campaignDir(templatePath) !== dir) continue;
      templates[recipientTypeFromPath(templatePath)] = content;
    }

    const instructions: Record<string, Instruction> = {};
    for (const [instructionPath, content] of Object.entries(instructionFiles)) {
      if (campaignDir(instructionPath) !== dir) continue;
      instructions[recipientTypeFromPath(instructionPath)] = parseInstruction(content);
    }

    campaigns.push({ ...meta, dir, templates, instructions });
  }

  campaigns.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return campaigns;
}
