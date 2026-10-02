// One label-and-value pair in a detail page's facts grid.

export function Fact({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className={tabular ? 'tabular font-medium' : 'font-medium'}>{value}</span>
    </div>
  )
}
