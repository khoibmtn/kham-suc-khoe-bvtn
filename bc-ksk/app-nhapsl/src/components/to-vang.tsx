import { Fragment } from 'react';
import { chiaDoan, type Khoang } from '@/lib/tim-mo';

export type ToVangProps = {
  text: string | number | null | undefined;
  ranges?: Khoang[] | null;
};

export function ToVang({ text, ranges }: ToVangProps) {
  const s = text === null || text === undefined ? '' : String(text);
  if (!s) return null;
  if (!ranges || ranges.length === 0) return <>{s}</>;

  const doan = chiaDoan(s, ranges);
  return (
    <>
      {doan.map((d, i) =>
        d.mark ? (
          <mark key={i} className="hl">
            {d.t}
          </mark>
        ) : (
          <Fragment key={i}>{d.t}</Fragment>
        ),
      )}
    </>
  );
}
