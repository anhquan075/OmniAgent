export interface McpResultSummaryItem {
  label: string;
  value: string;
}

export interface FormattedMcpResult {
  status: "OK" | "Error" | "Text";
  source: string;
  parsedText: string;
  rawText: string;
  summary: McpResultSummaryItem[];
  hasParsedPayload: boolean;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function short(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 14) return typeof value === "string" ? value : null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function bool(value: unknown): string | null {
  return typeof value === "boolean" ? (value ? "Enabled" : "Disabled") : null;
}

function buildSummary(value: unknown): McpResultSummaryItem[] {
  const record = asRecord(value);
  if (!record) return [];

  const meta = asRecord(record._meta);
  const allowedTokens = Array.isArray(record.allowedTokens) ? record.allowedTokens : null;
  const items: McpResultSummaryItem[] = [];

  const network = typeof record.network === "string" ? record.network.toUpperCase() : null;
  const chainId = typeof record.chainId === "number" ? String(record.chainId) : null;
  if (network || chainId) items.push({ label: "Network", value: [network, chainId && `#${chainId}`].filter(Boolean).join(" ") });

  const wallet = short(record.userWallet ?? meta?.userWallet);
  if (wallet) items.push({ label: "Wallet", value: wallet });

  const trading = bool(record.tradingEnabled);
  if (trading) items.push({ label: "Trading", value: trading });

  const twakMode = typeof record.trustWalletAgentKitMode === "string" ? record.trustWalletAgentKitMode : null;
  if (twakMode) items.push({ label: "TWAK", value: twakMode });

  const sdk = bool(record.bnbAgentSdkEnabled);
  if (sdk) items.push({ label: "BNB SDK", value: sdk });

  if (allowedTokens) items.push({ label: "Tokens", value: `${allowedTokens.length} eligible` });

  const competition = short(record.competitionContractAddress);
  if (competition) items.push({ label: "Competition", value: competition });

  return items.slice(0, 6);
}

function extractPayload(envelope: unknown): { payload: unknown; source: string; parsed: boolean } {
  const root = asRecord(envelope);
  const result = asRecord(root?.result);
  const content = Array.isArray(result?.content) ? result.content : null;
  const textItems = content
    ?.map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => !!item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);

  if (textItems?.length === 1) {
    const nested = parseJson(textItems[0]);
    return nested.ok
      ? { payload: nested.value, source: "Parsed content.text JSON", parsed: true }
      : { payload: textItems[0], source: "Result text", parsed: false };
  }

  if (textItems && textItems.length > 1) {
    return { payload: textItems, source: "Result text list", parsed: false };
  }

  if (root && "result" in root) return { payload: root.result, source: "JSON-RPC result", parsed: false };
  return { payload: envelope, source: "JSON response", parsed: false };
}

export function formatMcpResult(responseText: string): FormattedMcpResult {
  const parsedEnvelope = parseJson(responseText);
  if (!parsedEnvelope.ok) {
    return {
      status: responseText.startsWith("Error:") ? "Error" : "Text",
      source: "Plain response",
      parsedText: responseText,
      rawText: responseText,
      summary: [],
      hasParsedPayload: false,
    };
  }

  const envelopeRecord = asRecord(parsedEnvelope.value);
  const rawText = JSON.stringify(parsedEnvelope.value, null, 2);
  if (envelopeRecord?.error) {
    return {
      status: "Error",
      source: "JSON-RPC error",
      parsedText: stringify(envelopeRecord.error),
      rawText,
      summary: [],
      hasParsedPayload: false,
    };
  }

  const extracted = extractPayload(parsedEnvelope.value);
  return {
    status: "OK",
    source: extracted.source,
    parsedText: stringify(extracted.payload),
    rawText,
    summary: buildSummary(extracted.payload),
    hasParsedPayload: extracted.parsed || extracted.payload !== parsedEnvelope.value,
  };
}
