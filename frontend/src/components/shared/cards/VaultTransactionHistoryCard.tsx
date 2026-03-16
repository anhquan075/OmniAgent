const BSCSCAN = "https://bscscan.com/tx/";

function shortHash(hash) {
  if (!hash) return null;
  return hash.slice(0, 10) + "…" + hash.slice(-6);
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return iso; }
}

export function VaultTransactionHistoryCard({ txHistory, onClear, blockExplorer }) {
  const explorerTxBase = blockExplorer ? `${blockExplorer}/tx/` : "https://bscscan.com/tx/";
  const showClear = txHistory?.length > 0 && typeof onClear === "function";

  if (!txHistory?.length) {
    return (
      <div className="card">
        <p className="eyebrow">Transaction History</p>
        <div className="txHeaderRow">
          <h3 className="cardTitle">Recent Activity</h3>
        </div>
        <p className="txEmpty">No transactions yet this session.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="eyebrow">Transaction History</p>
      <div className="txHeaderRow">
        <h3 className="cardTitle">Recent Activity</h3>
        {showClear && (
          <button type="button" className="txClearBtn" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <ul className="txList">
        {txHistory.map(tx => (
          <li key={tx.id} className="txItem">
            <div className="txTop">
              <span className="txAction">{tx.action}</span>
              <span className={`txOutcome txOutcome--${tx.outcome}`}>{tx.outcome}</span>
            </div>
            <div className="txMeta">
              <span>{fmtTime(tx.at)}</span>
              {tx.hash
                ? <a href={`${explorerTxBase}${tx.hash}`} target="_blank" rel="noopener noreferrer">
                    {shortHash(tx.hash)} ↗ Explorer
                  </a>
                : <span style={{ color: "#ef4444", fontSize: 11 }}>no hash</span>
              }
            </div>
            {tx.note && tx.outcome === "failed" && (
              <p className="txNote">{tx.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
