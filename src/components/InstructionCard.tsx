import { markdownToHtml } from '../lib/markdown';
import { renderTemplate } from '../lib/template';
import type { Instruction, TemplateContext } from '../types';
import { CopyFields, type CopyField } from './CopyFields';

interface InstructionCardProps {
  instruction: Instruction;
  /** Anzeigename des Typs, falls die Anleitung keine eigene Überschrift hat. */
  fallbackTitle: string;
}

/**
 * Schritt 4 für Anleitungstypen (M7): Beschreibung des Verfahrens und Link zum
 * externen Webformular. Die Formularfelder folgen in Schritt 5.
 */
export function InstructionCard({ instruction, fallbackTitle }: InstructionCardProps) {
  return (
    <div className="instruction">
      <h3 className="subheading">{instruction.title ?? fallbackTitle}</h3>
      <div
        className="doc-content instruction-body"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(instruction.body) }}
      />

      {instruction.url && (
        <p className="instruction-actions">
          <a
            className="button"
            href={instruction.url}
            target="_blank"
            rel="noreferrer"
          >
            {instruction.linkLabel ?? 'Formular öffnen'}
          </a>
        </p>
      )}

      {instruction.fields.length > 0 && (
        <p className="hint">
          Die Angaben für das Formular findest du in Schritt 5 – jedes Feld lässt sich
          einzeln kopieren.
        </p>
      )}
    </div>
  );
}

interface InstructionFieldsProps {
  instruction: Instruction;
  context: TemplateContext;
}

/**
 * Schritt 5 für Anleitungstypen (M7): rendert die im Frontmatter definierten
 * Formularfelder mit Absenderdaten und Nachrichtentext.
 */
export function InstructionFields({ instruction, context }: InstructionFieldsProps) {
  if (instruction.fields.length === 0) {
    return (
      <p className="hint">
        Für diesen Empfängertyp sind noch keine Formularfelder hinterlegt.
      </p>
    );
  }

  const fields: CopyField[] = instruction.fields.map((field, index) => ({
    id: `feld-${index + 1}`,
    label: field.label,
    value: renderTemplate(field.value, context),
    multiline: field.multiline,
    note: field.note,
  }));

  return (
    <CopyFields
      hint="Kopiere die Felder einzeln und füge sie im Formular ein. Die Angaben werden nur in deinem Browser erzeugt."
      fields={fields}
      idPrefix="anleitung"
    />
  );
}
