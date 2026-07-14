import { CheckCircle2Icon, CircleDashedIcon, ShieldAlertIcon } from 'lucide-react';

import { lifecycleRows, type Payload, type SourceState } from './flight-deck-model';
import { proofLabel } from './proof-labels';

export default function ReceiptFlowTimeline({ bundle, sourceState }: { bundle?: Payload; sourceState: SourceState }) {
  const rows = lifecycleRows(bundle, sourceState);
  return (
    <section className="flight-panel receipt-flow-timeline" aria-label="Receipt flow timeline">
      <div className="flight-panel-head">
        <h2>Receipt flow timeline</h2>
        <span>{rows.length} steps</span>
      </div>
      <ol>
        {rows.map((row, index) => {
          const blocked = row.status.includes('blocked') || row.status.includes('missing');
          const Icon = row.complete ? CheckCircle2Icon : blocked ? ShieldAlertIcon : CircleDashedIcon;
          return (
            <li key={`${row.state}-${index}`} className={row.complete ? 'is-complete' : blocked ? 'is-blocked' : ''}>
              <Icon className="h-5 w-5" />
              <b>{index + 1}. {proofLabel(row.state, { stripCasperPrefix: true })}</b>
              <span>{proofLabel(row.status, { stripCasperPrefix: true })}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
