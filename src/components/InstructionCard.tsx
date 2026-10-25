import { markdownToHtml } from '../lib/markdown';
import { renderTemplate } from '../lib/template';
import type { Instruction, InstructionField, TemplateContext } from '../types';
import { CopyFieldItem, CopyFields, type CopyField } from './CopyFields';

interface InstructionCardProps {
  instruction: Instruction;
  /** Anzeigename des Typs, falls die Anleitung keine eigene Überschrift hat. */
  fallbackTitle: string;
  /** Daten für Platzhalter in den Feldwerten (Absender, Betreff, Nachricht). */
  context: TemplateContext;
  /** Felder ausblenden, solange kein Text für das Webformular hinterlegt ist. */
  showFields?: boolean;
}

/** Markiert im Markdown die Stelle, an der die strukturierten Schritte stehen. */
const STEPS_MARKER = /^[ \t]*<!--[ \t]*schritte[ \t]*-->[ \t]*$/m;

/** Teilt den Anleitungstext an der Schritt-Markierung in Vor- und Nachspann. */
function splitBody(body: string): { before: string; after: string } {
  const match = STEPS_MARKER.exec(body);
  if (!match || match.index === undefined) return { before: body, after: '' };

  return {
    before: body.slice(0, match.index).trim(),
    after: body.slice(match.index + match[0].length).trim(),
  };
}

function toCopyField(field: InstructionField, context: TemplateContext): CopyField {
  return {
    id: field.id,
    label: field.label,
    value: renderTemplate(field.value, context),
    multiline: field.multiline,
    note: field.note,
  };
}

/**
 * Anleitung für Anleitungstypen (M7): Beschreibung, Schritt-für-Schritt-Ablauf
 * und Link zum externen Webformular. Felder werden direkt im jeweiligen Schritt
 * zum Kopieren angeboten; Schritte ohne Feld brauchen keine Eingabe.
 */
export function InstructionCard({
  instruction,
  fallbackTitle,
  context,
  showFields = true,
}: InstructionCardProps) {
  const { before, after } = splitBody(instruction.body);
  const byId = new Map(instruction.fields.map((field) => [field.id, field]));
  const placedIds = new Set(instruction.steps.flatMap((step) => step.fields ?? []));
  const leftover = showFields
    ? instruction.fields.filter((field) => !placedIds.has(field.id))
    : [];
  // Der Portal-Link kann an einem Schritt hängen; sonst steht er am Kartenende.
  const linkInStep = instruction.steps.some((step) => step.link);

  return (
    <div className="instruction">
      <h3 className="subheading">{instruction.title ?? fallbackTitle}</h3>

      {before && (
        <div
          className="doc-content instruction-body"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(before) }}
        />
      )}

      {instruction.steps.length > 0 && (
        <ol className="instruction-steps">
          {instruction.steps.map((step, index) => {
            const fields = showFields
              ? (step.fields ?? [])
                  .map((id) => byId.get(id))
                  .filter((field): field is InstructionField => Boolean(field))
              : [];

            return (
              <li key={index}>
                <div
                  className="instruction-step-text"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(step.text) }}
                />
                {step.link && instruction.url && (
                  <p className="instruction-step-link">
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
                {fields.length > 0 && (
                  <div className="instruction-step-fields">
                    {fields.map((field) => (
                      <CopyFieldItem
                        key={field.id}
                        field={toCopyField(field, context)}
                        idPrefix="anleitung"
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {after && (
        <div
          className="doc-content instruction-body"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(after) }}
        />
      )}

      {leftover.length > 0 && (
        <CopyFields
          hint="Kopiere die Felder einzeln und füge sie im Formular ein. Die Angaben werden nur in deinem Browser erzeugt."
          fields={leftover.map((field) => toCopyField(field, context))}
          idPrefix="anleitung"
        />
      )}

      {instruction.url && !linkInStep && (
        <p className="instruction-actions">
          <a className="button" href={instruction.url} target="_blank" rel="noreferrer">
            {instruction.linkLabel ?? 'Formular öffnen'}
          </a>
        </p>
      )}
    </div>
  );
}
