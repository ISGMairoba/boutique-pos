import { type BusinessSettings, formatMoney, term } from '@boutique/domain';
import { cn } from '@boutique/ui';
import { formatDateTime } from '../licence/labels.ts';

interface Line {
  name: string;
  detail: string;
  quantity: number;
  price: number;
}

// Example lines for the preview only; amounts in minor units.
const SAMPLE: Line[] = [
  { name: 'Linen shirt', detail: 'M / Sand', quantity: 1, price: 1_850_000 },
  { name: 'Canvas tote', detail: 'Black', quantity: 2, price: 450_000 },
];

/** What a printed receipt looks like with these settings, using example items. */
export function ReceiptPreview({
  settings,
  businessName,
  receiptPrefix,
  deviceCode,
  logoUrl,
  paperWidth,
  currency,
  locale,
  timeZone,
}: {
  settings: BusinessSettings;
  businessName: string;
  receiptPrefix: string;
  deviceCode: string;
  logoUrl: string | null;
  paperWidth: 58 | 80;
  currency: string;
  locale: string;
  timeZone: string;
}) {
  const money = (minor: number) => formatMoney(minor, { currency, locale });
  const total = SAMPLE.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const { receipt } = settings;
  const payment = settings.paymentMethods[0] ?? 'Cash';
  const channel = settings.channels[0] ?? '';

  return (
    <figure
      aria-label="Receipt preview"
      className={cn(
        'mx-auto grid gap-1 border border-dashed bg-card px-4 py-5 font-mono text-[11px] leading-snug text-card-foreground',
        paperWidth === 58 ? 'w-[230px]' : 'w-[310px]',
      )}
    >
      {receipt.showLogo && logoUrl && (
        <img src={logoUrl} alt="" className="mx-auto mb-1 max-h-16 max-w-[70%] object-contain" />
      )}
      <div className="text-center text-xs font-semibold uppercase tracking-wider">{businessName}</div>
      {receipt.header
        .filter((line) => line.trim())
        .map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: header lines are plain text in a fixed order.
          <div key={index} className="text-center text-muted-foreground">
            {line}
          </div>
        ))}
      <hr className="my-1 border-dashed" />
      <div className="flex justify-between gap-2">
        <span>{term(settings, 'receipt')}</span>
        <span>
          {receiptPrefix}-{deviceCode}-000123
        </span>
      </div>
      <div className="flex justify-between gap-2">
        <span>{formatDateTime(new Date(), locale, timeZone)}</span>
      </div>
      {receipt.showCashier && (
        <div className="flex justify-between gap-2">
          <span>{term(settings, 'cashier')}</span>
          <span>Amaka</span>
        </div>
      )}
      {receipt.showCustomer && (
        <div className="flex justify-between gap-2">
          <span>{term(settings, 'customer')}</span>
          <span>Mrs Okafor{channel ? ` · ${channel}` : ''}</span>
        </div>
      )}
      <hr className="my-1 border-dashed" />
      {SAMPLE.map((line) => (
        <div key={line.name}>
          <div>{line.name}</div>
          <div className="flex justify-between gap-2 text-muted-foreground">
            <span>
              {line.detail} · {line.quantity} × {money(line.price)}
            </span>
            <span className="text-card-foreground">{money(line.price * line.quantity)}</span>
          </div>
        </div>
      ))}
      <hr className="my-1 border-dashed" />
      <div className="flex justify-between gap-2 text-xs font-semibold">
        <span>TOTAL</span>
        <span>{money(total)}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span>{payment}</span>
        <span>{money(total)}</span>
      </div>
      {receipt.showBarcode && (
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-8 w-4/5 bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_4px,currentColor_4px_5px,transparent_5px_8px)]"
        />
      )}
      {receipt.footer.trim() && (
        <div className="mt-1 whitespace-pre-line text-center text-muted-foreground">
          {receipt.footer.trim()}
        </div>
      )}
      <figcaption className="mt-2 text-center text-[10px] text-muted-foreground">
        Example items · {paperWidth} mm paper
      </figcaption>
    </figure>
  );
}
