import { describe, expect, it } from 'vitest';
import { chainExplorerUrl } from './chain-proof-link';

describe('chainExplorerUrl', () => {
  it('uses an explicit explorer URL when one is provided', () => {
    expect(chainExplorerUrl({
      hash: 'deploy-hash',
      explorerUrl: 'https://testnet.cspr.live/deploy/deploy-hash',
      explorerBaseUrl: 'https://example.invalid',
      kind: 'deploy',
    })).toBe('https://testnet.cspr.live/deploy/deploy-hash');
  });

  it('builds Casper explorer paths from the base URL and proof kind', () => {
    expect(chainExplorerUrl({
      hash: 'package-hash',
      explorerBaseUrl: 'https://testnet.cspr.live/',
      kind: 'contract-package',
    })).toBe('https://testnet.cspr.live/contract-package/package-hash');
  });

  it('defaults to deploy links and returns empty for missing hashes', () => {
    expect(chainExplorerUrl({ hash: 'abc123' })).toBe('https://testnet.cspr.live/deploy/abc123');
    expect(chainExplorerUrl({ hash: '' })).toBe('');
    expect(chainExplorerUrl({ hash: null })).toBe('');
  });
});
