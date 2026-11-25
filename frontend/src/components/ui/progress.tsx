export function Progress({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted">{clamped}%</span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
