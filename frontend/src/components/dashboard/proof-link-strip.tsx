import { ExternalLinkIcon, FileCheckIcon, LandmarkIcon } from "lucide-react";

type ProofLink = {
  href: string;
  label: string;
  value: string;
  icon: typeof LandmarkIcon;
  pending?: boolean;
};

const shortHash = (value: string) => (
  value.startsWith("0x") && value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value
);

export function ProofLinkStrip({
  contractAddress,
  registrationTx,
}: {
  contractAddress: string;
  registrationTx?: string;
}) {
  const links: ProofLink[] = [
    {
      href: `https://bsctrace.com/address/${contractAddress}`,
      label: "Competition contract",
      value: shortHash(contractAddress),
      icon: LandmarkIcon,
    },
    {
      href: registrationTx ? `https://bscscan.com/tx/${registrationTx}` : "#",
      label: "Registration proof",
      value: registrationTx ? shortHash(registrationTx) : "waiting",
      icon: FileCheckIcon,
      pending: !registrationTx,
    },
  ];

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {links.map(({ href, label, value, icon: Icon, pending }) => (
        <a
          key={label}
          href={href}
          target={pending ? undefined : "_blank"}
          rel="noreferrer"
          aria-disabled={pending}
          className={`proof-link-chip ${pending ? "pointer-events-none opacity-55" : ""}`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-bnb-gold" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-semibold uppercase text-white/45">{label}</span>
            <span className="block truncate font-mono text-[11px] text-white/82">{value}</span>
          </span>
          <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-white/38" />
        </a>
      ))}
    </div>
  );
}

export default ProofLinkStrip;
