"use client";

import Link from "next/link";

export default function StatCard({
  title,
  value,
  accent,
  href,
  hint,
}: {
  title: string;
  value: string;
  accent: string;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <div className="card group h-full p-4 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </p>
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
