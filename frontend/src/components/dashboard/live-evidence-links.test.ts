import { describe, expect, it } from "vitest";
import { bscAddressLink, bscTxLink, safeEvidenceHref } from "./live-evidence-links";

describe("live evidence links", () => {
  it("builds BscScan and BscTrace links for wallet and tx proof", () => {
    const address = `0x${"a".repeat(40)}`;
    const hash = `0x${"b".repeat(64)}`;

    expect(bscAddressLink(address)?.href).toBe(`https://bscscan.com/address/${address}`);
    expect(bscAddressLink(address, "BscTrace wallet", "bsctrace")?.href).toBe(
      `https://bsctrace.com/address/${address}`,
    );
    expect(bscTxLink(hash, undefined, "bsctrace")?.href).toBe(
      `https://bsctrace.com/tx/${hash}`,
    );
  });

  it("allows explorer proof links without allowing embedded data uris", () => {
    expect(
      safeEvidenceHref("https://bsctrace.com/address/0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"),
    ).toContain("bsctrace.com");
    expect(safeEvidenceHref("data:application/json;base64,eyJwcm9vZiI6InJhdyJ9")).toBeNull();
  });
});
