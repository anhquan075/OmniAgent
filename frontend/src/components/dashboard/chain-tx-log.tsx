import { ExternalLinkIcon, HashIcon } from 'lucide-react';

type McpPayload = Record<string, any>;

const text = (value: unknown, fallback: string) => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);

const txHashOf = (event: McpPayload) => (
  event.txHash ?? event.transactionHash ?? event.proof?.txHash ?? event.payload?.txHash
);

const shortHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

export function ChainTxLog({ events }: { events: McpPayload[] }) {
  const txEvents = events.filter((event) => txHashOf(event));
  const visibleEvents = txEvents.slice(0, 4);

  return (
    <section className="chain-tx-log-panel">
      <div className="chain-tx-head">
        <div>
          <span>On-chain audit</span>
          <h3>Blockchain Proof Log</h3>
        </div>
        <b>{txEvents.length ? `${txEvents.length} proofs` : "BSC"}</b>
      </div>
      <div className="chain-tx-list">
        {visibleEvents.length ? visibleEvents.map((event, index) => {
          const hash = String(txHashOf(event));
          return (
            <div key={`${hash}-${index}`} className="chain-tx-card" style={{ animationDelay: `${index * 70}ms` }}>
              <div className="chain-tx-card-head">
                <p>{text(event.type ?? event.eventType, 'bsc_tx')}</p>
                <span>{text(event.proofStatus, 'recorded')}</span>
              </div>
              <a className="chain-tx-link" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
                <HashIcon className="h-3 w-3" />
                {shortHash(hash)}
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          );
        }) : (
          <div className="chain-tx-empty">
            <strong>Awaiting chain proof</strong>
            <p>Signed swaps and registration hashes will appear here after the backend records live BSC proof.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default ChainTxLog;
