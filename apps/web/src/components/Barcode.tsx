import { code128Widths } from '@boutique/domain';

/** A Code 128 barcode drawn as SVG. Uses currentColor, so it prints black on labels. */
export function Barcode({
  value,
  height = 40,
  className,
}: {
  value: string;
  height?: number;
  className?: string;
}) {
  let widths: number[];
  try {
    widths = code128Widths(value);
  } catch {
    return null;
  }
  const quiet = 10;
  const total = widths.reduce((sum, width) => sum + width, 0) + quiet * 2;
  let x = quiet;
  const bars: { x: number; w: number }[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push({ x, w: width });
    x += width;
  });
  return (
    <svg
      viewBox={`0 0 ${total} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.w} height={height} fill="currentColor" />
      ))}
    </svg>
  );
}
