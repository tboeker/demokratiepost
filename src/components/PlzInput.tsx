import type { FormEvent } from 'react';

interface PlzInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function PlzInput({ value, onChange, onSubmit, loading }: PlzInputProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="plz-form" onSubmit={handleSubmit}>
      <label className="label" htmlFor="plz">
        Postleitzahl
      </label>
      <div className="plz-row">
        <input
          id="plz"
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="z. B. 10115"
          maxLength={5}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
          data-bwignore="true"
        />
        <button className="button" type="submit" disabled={loading || value.length !== 5}>
          {loading ? 'Suche …' : 'Empfänger suchen'}
        </button>
      </div>
    </form>
  );
}
