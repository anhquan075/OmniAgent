import { describe, expect, it } from "vitest";
import { formatMcpResult } from "../components/dashboard/mcp-result-utils";

describe("formatMcpResult", () => {
  it("unwraps JSON-RPC content text into readable JSON", () => {
    const inner = {
      network: "bsc",
      chainId: 56,
      tradingEnabled: false,
      trustWalletAgentKitMode: "disabled",
      bnbAgentSdkEnabled: true,
      userWallet: "0x79526d186882EC1cc9e02291b22AD6b626bF4A2a",
      allowedTokens: [
        { symbol: "BNB", address: "native" },
        { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" },
      ],
    };
    const response = {
      jsonrpc: "2.0",
      id: 1780648622261,
      result: {
        content: [{ type: "text", text: JSON.stringify(inner, null, 2) }],
      },
    };

    const formatted = formatMcpResult(JSON.stringify(response, null, 2));

    expect(formatted.status).toBe("OK");
    expect(formatted.source).toBe("Parsed content.text JSON");
    expect(formatted.parsedText).toContain('"network": "bsc"');
    expect(formatted.parsedText).toContain('"allowedTokens": [');
    expect(formatted.parsedText).not.toContain('\\n  "network"');
    expect(formatted.summary).toEqual(expect.arrayContaining([
      { label: "Network", value: "BSC #56" },
      { label: "Trading", value: "Disabled" },
      { label: "Tokens", value: "2 eligible" },
    ]));
    expect(formatted.rawText).toContain('"jsonrpc": "2.0"');
  });
});
