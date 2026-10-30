'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({ page, pageCount, totalItems, pageSize, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div
      className={[
        'flex flex-col gap-3 border-t border-white/10 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between',
        className ?? 'px-4',
      ].join(' ')}
    >
      <p>
        Mostrando <span className="text-slate-200">{start}-{end}</span> de <span className="text-slate-200">{totalItems}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5 text-slate-300 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </button>
        <span className="rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 font-medium text-sky-200">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5 text-slate-300 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Próxima <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
