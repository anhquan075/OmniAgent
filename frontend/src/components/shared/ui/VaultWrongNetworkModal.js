
/// Modal shown when wallet is connected to an unsupported chain (not BNB Mainnet).
export function VaultWrongNetworkModal({ networkLabel, isBusy, onDismiss }) {
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="networkModalTitle">
      <div className="modalCard">
        <h3 id="networkModalTitle" className="modalTitle">Wrong Network</h3>
        <p className="modalText">
          This app runs on <strong>BNB Mainnet (chain ID 56)</strong>. You are currently on{" "}
          <strong>{networkLabel}</strong>. Please switch networks in your wallet and reconnect.
        </p>
        <div className="modalActions">
          <button type="button" onClick={onDismiss} disabled={isBusy}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
