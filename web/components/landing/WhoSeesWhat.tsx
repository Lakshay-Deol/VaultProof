import { cx } from "@/lib/utils/format";

/** Threat model §10, rendered as the table it deserves to be. */
const COLUMNS = ["API key", "Exact balance", "Exchange used", "Tier"] as const;

type Cell = "yes" | "no" | "public";

const ROWS: Array<{ party: string; note?: string; cells: [Cell, Cell, Cell, Cell] }> = [
  { party: "The user", cells: ["yes", "yes", "yes", "yes"] },
  {
    party: "The enclave",
    note: "during one request",
    cells: ["yes", "yes", "yes", "yes"],
  },
  { party: "VaultProof operators", cells: ["no", "no", "no", "public"] },
  { party: "The relay host or cloud provider", cells: ["no", "no", "no", "public"] },
  { party: "The lending protocol", cells: ["no", "no", "no", "public"] },
  { party: "Anyone reading the chain", cells: ["no", "no", "no", "public"] },
];

function CellMark({ value }: { value: Cell }) {
  if (value === "yes") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />
        yes
      </span>
    );
  }
  if (value === "public") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-flare-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-flare" />
        public
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
      <span className="h-[1px] w-3 bg-line-strong" />
      no
    </span>
  );
}

export function WhoSeesWhat() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="label pb-3 pr-6 font-medium">Party</th>
            {COLUMNS.map((col, i) => (
              <th
                key={col}
                className={cx(
                  "label pb-3 pr-6 font-medium",
                  i === COLUMNS.length - 1 && "text-flare-ink",
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.party} className="border-b border-line last:border-0">
              <td className="py-3.5 pr-6 align-top">
                <span className="text-[15px] text-ink">{row.party}</span>
                {row.note ? (
                  <span className="ml-2 text-[13px] text-ink-faint">{row.note}</span>
                ) : null}
              </td>
              {row.cells.map((cell, i) => (
                <td key={`${row.party}-${i}`} className="py-3.5 pr-6 align-top">
                  <CellMark value={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
