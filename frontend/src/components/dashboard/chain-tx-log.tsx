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

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-[#070b0d]/85 p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Blockchain Tx Hash Log</h3>
        <span className="rounded-full border border-bnb-gold/20 px-2 py-1 text-[10px] font-semibold uppercase text-bnb-gold">
          BSC
        </span>
      </div>
      <div className="min-h-0 space-y-2 overflow-hidden pr-1">
        {txEvents.length ? txEvents.slice(0, 4).map((event, index) => {
          const hash = String(txHashOf(event));
          return (
            <div key={`${hash}-${index}`} className="chain-tx-card rounded-md border border-white/10 bg-white/[0.035] p-2" style={{ animationDelay: `${index * 70}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-white">{text(event.type ?? event.eventType, 'bsc_tx')}</p>
                <span className="text-[10px] uppercase text-emerald-200/75">{text(event.proofStatus, 'recorded')}</span>
              </div>
              <a className="mt-2 inline-flex items-center gap-1 font-mono text-xs font-semibold text-bnb-gold hover:text-yellow-200" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
                <HashIcon className="h-3 w-3" />
                {shortHash(hash)}
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          );
        }) : (
          <div className="rounded-md border border-dashed border-white/12 bg-white/[0.025] p-3 text-sm text-white/50">
            Waiting for live BSC receipts. Signed swaps and registration tx hashes will stream here.
          </div>
        )}
      </div>
    </section>
  );
}

export default ChainTxLog;
