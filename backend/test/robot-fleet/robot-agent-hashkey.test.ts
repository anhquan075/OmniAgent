import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

vi.mock('@/config/env', () => ({
  env: {
    HASHKEY_RPC_URL: 'https://testnet.hsk.xyz',
    HASHKEY_VAULT_ADDRESS: '0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318',
    HASHKEY_USDT_ADDRESS: '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038',
    HASHKEY_KYC_SBT_ADDRESS: '0x1525E262Cb5bDFC7b51802c36a1141bA94405F76',
    HASHKEY_DEPLOYER_PK: '0xb94e30b9827852ef3dfa000b6041b6548d0bce4b6c5413801a84c7670f0a4b4b',
    PRIVATE_KEY: '0xb94e30b9827852ef3dfa000b6041b6548d0bce4b6c5413801a84c7670f0a4b4b',
    SEPOLIA_RPC_URL: 'https://ethereum-sepolia.publicnode.com',
    WDK_SECRET_SEED: 'test seed words here and more words to make it long enough',
  }
}));

vi.mock('@tetherto/wdk-wallet-evm', () => {
  class MockWalletManager {
    async getAccount() {
      return {
        getAddress: () => Promise.resolve('0xABCDEF1234567890ABCDEF1234567890ABCDEF12'),
        getBalance: () => Promise.resolve(1000000000000000000n),
        sendTransaction: () => Promise.resolve({ hash: '0x' + 'a'.repeat(64) }),
        signTypedData: () => Promise.resolve('0x' + 'b'.repeat(130)),
        dispose: () => {},
      };
    }
  }
  return { default: MockWalletManager };
});

vi.mock('@x402/fetch', () => ({
  x402Client: class MockX402Client { },
  wrapFetchWithPayment: vi.fn().mockReturnValue(fetch),
}));
vi.mock('@x402/evm/exact/client', () => ({
  registerExactEvmScheme: vi.fn(),
}));

describe('[UNIT] HashKey Robot Fleet Config (via mocked env)', () => {
  it('hashkeyEnabled robots config returns hashkey robots', async () => {
    process.env.ROBOT_FLEET_HASHKEY_ENABLED = 'true';
    process.env.ROBOT_FLEET_ENABLED = 'false';
    const { getRobotFleetConfig } = await import('@/config/robot-fleet');
    const cfg = getRobotFleetConfig();
    expect(cfg.hashkeyEnabled).toBe(true);
    const hk = cfg.robots.filter(r => (r as any).chain === 'hashkey');
    expect(hk.length).toBeGreaterThanOrEqual(2);
  });
});

describe('[UNIT] HashKey RobotAgent — Chain Routing', () => {
  it('RobotAgentConfig accepts chain field', async () => {
    const { RobotAgent } = await import('@/services/robot-fleet/robot-agent');
    const agent = new RobotAgent({ id: 'R1', type: 'Test', accountIndex: 0, rpcUrl: 'http://localhost', chain: 'hashkey' });
    expect(agent.chain).toBe('hashkey');
    agent.dispose();
  });

  it('defaults to sepolia chain', async () => {
    const { RobotAgent } = await import('@/services/robot-fleet/robot-agent');
    const agent = new RobotAgent({ id: 'R1', type: 'Test', accountIndex: 0, rpcUrl: 'http://localhost' });
    expect(agent.chain).toBe('sepolia');
    agent.dispose();
  });

  it('createRobotAgent factory defaults to sepolia', async () => {
    const { createRobotAgent } = await import('@/services/robot-fleet/robot-agent');
    const agent = await createRobotAgent('R1', 'Test', 0);
    expect(agent.chain).toBe('sepolia');
    agent.dispose();
  });

  it('createRobotAgent factory accepts hashkey chain', async () => {
    const { createRobotAgent } = await import('@/services/robot-fleet/robot-agent');
    const agent = await createRobotAgent('R2', 'HK Agent', 0, 'hashkey', 'https://testnet.hsk.xyz');
    expect(agent.chain).toBe('hashkey');
    agent.dispose();
  });
});
