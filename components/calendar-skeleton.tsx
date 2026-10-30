export function CalendarSkeleton() {
  return (
    <div className="glass-panel overflow-hidden rounded-[28px] p-6">
      <div className="mb-6 grid grid-cols-[220px_repeat(10,minmax(110px,1fr))] gap-3">
        {Array.from({ length: 11 }).map((_, index) => (
          <div key={index} className="skeleton h-12" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-[220px_repeat(10,minmax(110px,1fr))] gap-3">
            {Array.from({ length: 11 }).map((_, columnIndex) => (
              <div key={`${rowIndex}-${columnIndex}`} className="skeleton h-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
