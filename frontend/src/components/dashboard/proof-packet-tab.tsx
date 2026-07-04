import { useEffect, useState } from 'react';

import { apiFetch } from '../../lib/api';
import EvidenceSummary from './evidence-summary';
import EvidenceProvenance from './evidence-provenance';
import JudgePacket from './judge-packet';
import { decisionFromBundle, receiptFromBundle, type Payload, type SourceState } from './flight-deck-model';

export default function ProofPacketTab({ runtime, bundle, sourceState }: {
  runtime?: Payload;
  bundle?: Payload;
  sourceState: SourceState;
}) {
  const [verifyStatus, setVerifyStatus] = useState('');
  const [publicX402, setPublicX402] = useState<Payload>({});
  const decision = decisionFromBundle(bundle);
  const receipt = receiptFromBundle(bundle);
  useEffect(() => {
    let cancelled = false;
    if (sourceState !== 'live') {
      setPublicX402({});
      return () => { cancelled = true; };
    }
    void apiFetch('/api/public/proof')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`public proof ${res.status}`))))
      .then((data: Payload) => {
        if (!cancelled) setPublicX402(data.x402 && typeof data.x402 === 'object' ? data.x402 : {});
      })
      .catch(() => {
        if (!cancelled) setPublicX402({});
      });
    return () => { cancelled = true; };
  }, [sourceState, decision.decisionId]);
  const handleVerify = async () => {
    if (sourceState !== 'live') return;
    setVerifyStatus('verifying...');
    try {
      const res = await apiFetch('/api/mcp', {
        method: 'POST',
        body: JSON.stringify({
          method: 'tools/call',
          params: { name: 'casper_verify_decision_receipt', arguments: { decisionId: receipt.decisionId ?? decision.decisionId } },
        }),
      });
      if (!res.ok) throw new Error(`verify ${res.status}`);
      const data = await res.json();
      const result = JSON.parse(data.result?.content?.[0]?.text ?? '{}');
      setVerifyStatus(result.chainVerified ? 'chain verified' : result.localVerified ? 'local verified' : 'mismatch');
    } catch {
      setVerifyStatus('verify failed');
    }
  };
  return (
    <div className="proof-packet-tab">
      <JudgePacket runtime={runtime} bundle={bundle} sourceState={sourceState} onVerify={handleVerify} verifyStatus={verifyStatus} />
      <EvidenceProvenance bundle={sourceState === 'live' ? bundle : {}} x402={sourceState === 'live' ? publicX402 : {}} />
      <EvidenceSummary evidence={sourceState === 'live' ? decision.evidenceBundle : {}} x402={sourceState === 'live' ? publicX402 : {}} />
      <section className="flight-panel raw-evidence-preview">
        <div className="flight-panel-head">
          <h2>Raw evidence preview</h2>
          <span>JSON</span>
        </div>
        <pre>{JSON.stringify(sourceState === 'live' ? decision.evidenceBundle ?? {} : { status: 'unavailable' }, null, 2)}</pre>
      </section>
    </div>
  );
}
