export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-accent"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-accent rounded w-3/4"></div>
          <div className="h-3 bg-accent rounded w-1/2"></div>
        </div>
      </div>

      {/* Question */}
      <div className="space-y-3 mb-4">
        <div className="h-3 bg-accent rounded w-full"></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 bg-accent rounded-lg"></div>
          <div className="h-16 bg-accent rounded-lg"></div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-4">
          <div className="h-3 bg-accent rounded w-12"></div>
          <div className="h-3 bg-accent rounded w-8"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-accent rounded"></div>
          <div className="h-5 w-5 bg-accent rounded"></div>
        </div>
      </div>
    </div>
  );
}
