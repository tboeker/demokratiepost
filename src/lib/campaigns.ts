import { parse } from 'yaml';
import type { Campaign, CampaignMeta } from '../types';

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

/** Ermittelt den Kampagnen-Ordner aus einem Glob-Pfad. */
function campaignDir(path: string): string {
  const match = path.match(/campaigns\/([^/]+)\//);
  return match ? match[1] : '';
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
      const recipientType = templatePath.split('/').pop()!.replace(/\.md$/, '');
      templates[recipientType] = content;
    }

    campaigns.push({ ...meta, dir, templates });
  }

  campaigns.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return campaigns;
}
