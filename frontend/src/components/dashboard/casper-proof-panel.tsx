import ProofPacketTab from './proof-packet-tab';
import type { Payload } from './flight-deck-model';

export function CasperProofPanel({ runtime, bundle }: { runtime?: Payload; bundle?: Payload }) {
  return <ProofPacketTab runtime={runtime} bundle={bundle} sourceState="live" />;
}

export default CasperProofPanel;
