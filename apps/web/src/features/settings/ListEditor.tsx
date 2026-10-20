import { Button, Input } from '@boutique/ui';
import { useId } from 'react';

/** Edits a short ordered list of names, such as sales channels or payment methods. */
export function ListEditor({
  items,
  onChange,
  disabled,
  max,
  addLabel,
  itemLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  disabled: boolean;
  max: number;
  addLabel: string;
  itemLabel: string;
}) {
  const baseId = useId();
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      <ol className="grid gap-2">
        {items.map((item, index) => (
          // Position is the identity here: rows are edited in place and reordered with the buttons.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <li key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <Input
              id={`${baseId}-${index}`}
              aria-label={`${itemLabel} ${index + 1}`}
              value={item}
              maxLength={30}
              disabled={disabled}
              onChange={(event) =>
                onChange(items.map((value, i) => (i === index ? event.target.value : value)))
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${item || itemLabel} up`}
              disabled={disabled || index === 0}
              onClick={() => move(index, index - 1)}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${item || itemLabel} down`}
              disabled={disabled || index === items.length - 1}
              onClick={() => move(index, index + 1)}
            >
              ↓
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${item || itemLabel}`}
              disabled={disabled || items.length <= 1}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </li>
        ))}
      </ol>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || items.length >= max}
          onClick={() => onChange([...items, ''])}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
