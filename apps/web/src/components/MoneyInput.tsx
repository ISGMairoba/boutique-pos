import { formatMoney, type Minor, minorDigits, parseAmount } from '@boutique/domain';
import { cn, Input } from '@boutique/ui';
import { type InputHTMLAttributes, useEffect, useState } from 'react';

function plain(minor: Minor | null, currency: string): string {
  if (minor === null) return '';
  const digits = minorDigits(currency);
  return (minor / 10 ** digits).toFixed(digits).replace(/\.0+$/, '');
}

/**
 * An amount typed as the shop says it ("12,500"), held as whole minor units. Shows the formatted amount
 * when not being edited. Calls onChange with null while the text is empty or not an amount.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  locale,
  allowEmpty = false,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: Minor | null;
  onChange: (value: Minor | null) => void;
  currency: string;
  locale: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(() => plain(value, currency));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(plain(value, currency));
  }, [value, currency, editing]);

  const parsed = text.trim() ? parseAmount(text, currency) : null;
  const invalid = text.trim() !== '' && (parsed === null || parsed < 0);

  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={invalid || (!allowEmpty && !text.trim()) || undefined}
      className={cn('tabular-nums', invalid && 'border-destructive', className)}
      value={editing ? text : value === null ? '' : formatMoney(value, { currency, locale })}
      onFocus={() => {
        setEditing(true);
        setText(plain(value, currency));
      }}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        setText(event.target.value);
        const next = event.target.value.trim() ? parseAmount(event.target.value, currency) : null;
        onChange(next !== null && next >= 0 ? next : null);
      }}
      {...props}
    />
  );
}
