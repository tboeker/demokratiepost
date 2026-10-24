import idee from '../../docs/idee.md?raw';
import impressum from '../../docs/impressum.md?raw';
import datenschutz from '../../docs/datenschutz.md?raw';

export type DocKey = 'idee' | 'impressum' | 'datenschutz';

const docs: Record<DocKey, string> = {
  idee,
  impressum,
  datenschutz,
};

export function isDocKey(value: string): value is DocKey {
  return value === 'idee' || value === 'impressum' || value === 'datenschutz';
}

export function getDoc(key: DocKey): string {
  return docs[key];
}