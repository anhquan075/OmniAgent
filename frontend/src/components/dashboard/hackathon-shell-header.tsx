import { CpuIcon, OrbitIcon, WalletCardsIcon } from "lucide-react";
import React from "react";

export const HackathonShellHeader: React.FC = () => {
  return (
    <header className="robot-core-panel shrink-0 overflow-hidden px-4 py-3">
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-bnb-gold/25 bg-bnb-gold/[0.08] text-bnb-gold">
            <CpuIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white md:text-2xl">
              OmniAgent BSC Autopilot
            </h1>
            <p className="truncate font-mono text-[11px] text-white/40">
              CMC signal / TWAK signer / BSC proof
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <HeaderChip icon={OrbitIcon} label="mode" value="autonomous" />
          <HeaderChip icon={WalletCardsIcon} label="wallet" value="agent" />
        </div>
      </div>
    </header>
  );
};

function HeaderChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CpuIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[116px] rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-white/36">
        <Icon className="h-3.5 w-3.5 text-cyan-200/75" />
        {label}
      </div>
      <p className="mt-0.5 whitespace-nowrap text-sm font-semibold text-white/82">{value}</p>
    </div>
  );
}

export default HackathonShellHeader;
