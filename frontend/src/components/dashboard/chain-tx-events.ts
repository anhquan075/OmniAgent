type Payload = Record<string, any>;

const txHashOf = (event: Payload) => (
  event.txHash ?? event.transactionHash ?? event.proof?.txHash ?? event.payload?.txHash
);

export const proofLogEvents = (state: Payload, ledgerEvents: Payload[]) => {
  const proofEvents = state.liveProofBundle?.txEvents?.length
    ? state.liveProofBundle.txEvents
    : ledgerEvents;
  const registration = state.competition?.registrationProof ?? {};
  const registrationHash = registration.txHash ?? state.competition?.registrationTxHash;
  const registrationEvent = registrationHash ? [{
    eventType: registration.eventType ?? 'competition_registered',
    txHash: registrationHash,
    proofStatus: registration.receiptProof?.valid || registration.statusProof?.valid ? 'verified' : 'recorded',
    payload: registration,
  }] : [];
  const seen = new Set<string>();
  return [...registrationEvent, ...proofEvents].filter((event) => {
    const hash = txHashOf(event);
    if (!hash || seen.has(String(hash))) return false;
    seen.add(String(hash));
    return true;
  });
};
