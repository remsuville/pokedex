import type { ReactNode } from 'react';

/** The dense label/value table that carries most of a species page. */
export function DataTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={label} className={i ? 'border-t border-hair' : ''}>
            <th className="w-[42%] py-2.5 pr-4 text-right align-top font-normal text-muted">{label}</th>
            <td className="py-2.5 align-top">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="rounded-md border border-hair bg-panel px-4">{children}</div>
    </section>
  );
}
