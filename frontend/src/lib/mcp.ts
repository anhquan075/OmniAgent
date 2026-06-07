import { apiFetch } from "./api";

export type TradeProofScore = {
  score: number;
  maxScore: number;
  status: string;
  hardBlocked: boolean;
  hardBlockers: string[];
  checks: Record<string, boolean>;
};

export type RecoveryCandidate = {
  id: string;
  type: string;
  label: string;
  reason: string;
  safeNextAction: string;
  canSubmitLiveTrade: boolean;
};

export type TradeWorkOrderLifecycle = {
  id: string;
  state: string;
  terminal: boolean;
  hardBlockers: string[];
  steps: Array<Record<string, string>>;
};

export type ProofBundlePayload = Record<string, any> & {
  workOrderLifecycle?: TradeWorkOrderLifecycle;
  proofScore?: TradeProofScore;
  recoveryCandidates?: RecoveryCandidate[];
  proofDigest?: string;
};

export const callMcpTool = async (
  userAddress: string | null | undefined,
  toolName: string,
  params: object = {},
) => {
  try {
    const request = () => apiFetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: params } }),
    });
    let res = await request();
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') || 1);
      await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 3) * 1000));
      res = await request();
    }
    
    const json = await res.json().catch(() => ({}));
    
    if (!res.ok || json.error) {
      const rpcMessage = typeof json.error === 'object' ? json.error?.message : undefined;
      const httpMessage = typeof json.message === 'string' ? json.message : undefined;
      const errorText = typeof json.error === 'string' ? json.error : undefined;
      throw new Error(rpcMessage || httpMessage || errorText || `MCP request failed (${res.status})`);
    }

    if (json.result?.content?.[0]?.text) {
      const parsed = JSON.parse(json.result.content[0].text);
      return { result: parsed };
    }

    return json;
  } catch (error) {
    console.error(`MCP Tool Error (${toolName}):`, error);
    throw error;
  }
};
