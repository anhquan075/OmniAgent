import React from "react";

export function DashboardCard({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`robot-core-panel flex min-h-0 flex-col overflow-visible p-2.5 md:overflow-hidden ${className}`}>
      <div className="relative z-10 mb-2.5 flex shrink-0 items-center gap-2 border-b border-white/10 pb-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-sm border border-bnb-gold/20 bg-bnb-gold/[0.07]">
          <Icon className="h-4 w-4 text-bnb-gold" />
        </span>
        <h2 className="font-heading text-[12px] font-semibold tracking-tight text-white/76">{title}</h2>
      </div>
      <div className="relative z-10 min-h-0 flex-1 overflow-visible md:overflow-hidden">{children}</div>
    </section>
  );
}
