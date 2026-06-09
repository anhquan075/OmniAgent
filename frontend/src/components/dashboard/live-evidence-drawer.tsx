import { ExternalLinkIcon } from "lucide-react";
import type { EvidencePayload } from "./live-evidence";

export function LiveEvidenceDrawer({ evidence }: { evidence: EvidencePayload }) {
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
      {evidence.links.length ? (
        <div className="live-evidence-links">
          {evidence.links.slice(0, 4).map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
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
