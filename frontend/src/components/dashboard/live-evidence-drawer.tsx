import { ExternalLinkIcon } from "lucide-react";
import type { EvidencePayload } from "./live-evidence";
import { safeEvidenceHref } from "./live-evidence-links";

export function LiveEvidenceDrawer({ evidence }: { evidence: EvidencePayload }) {
  const links = evidence.links
    .map((link) => ({ ...link, href: safeEvidenceHref(link.href) }))
    .filter((link): link is { label: string; href: string } => Boolean(link.href));

  return (
    <div className="live-evidence-drawer">
      <p>{evidence.summary}</p>
      {evidence.rows.length ? (
        <div className="live-evidence-grid">
          {evidence.rows.slice(0, 6).map((row) => (
            <span key={`${row.label}-${row.value}`}>
              <small>{row.label}</small>
              <b>{row.value}</b>
            </span>
          ))}
        </div>
      ) : null}
      {links.length ? (
        <div className="live-evidence-links">
          {links.slice(0, 4).map((link, index) => (
            <a key={`${link.label}-${link.href}-${index}`} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default LiveEvidenceDrawer;
