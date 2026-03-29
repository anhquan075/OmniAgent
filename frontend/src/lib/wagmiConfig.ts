import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia } from 'wagmi/chains';
import { createStorage } from 'wagmi';
import { mock } from 'wagmi/connectors';
import type { Chain } from 'wagmi/chains';

const TEST_ACCOUNTS = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'] as const;

export const hashkeyTestnet: Chain = {
  id: 133,
  name: 'HashKey Chain Testnet',
  nativeCurrency: { decimals: 18, name: 'HashKey Token', symbol: 'HSK' },
  rpcUrls: {
    default: { http: ['https://testnet.hsk.xyz'] },
    public: { http: ['https://testnet.hsk.xyz'] },
  },
  blockExplorers: {
    default: { name: 'HashKey Explorer', url: 'https://testnet-explorer.hsk.xyz' },
  },
  testnet: true,
};

export const hashkeyMainnet: Chain = {
  id: 177,
  name: 'HashKey Chain',
  nativeCurrency: { decimals: 18, name: 'HashKey Token', symbol: 'HSK' },
  rpcUrls: {
    default: { http: ['https://mainnet.hsk.xyz'] },
    public: { http: ['https://mainnet.hsk.xyz'] },
  },
  blockExplorers: {
    default: { name: 'HashKey Explorer', url: 'https://explorer.hsk.xyz' },
  },
  testnet: false,
};

/**
 * Get the initial chain based on VITE_DEFAULT_NETWORK environment variable
 * @returns {Object} The chain object (hashkeyTestnet, sepolia, or mainnet)
 */
export function getInitialChain(): Chain {
  const network = import.meta.env.VITE_DEFAULT_NETWORK || 'hashkey';

  switch (network.toLowerCase()) {
    case 'mainnet':
    case 'ethereum':
    case 'eth':
      return mainnet;
    case 'sepolia':
      return sepolia;
    case 'hashkey':
    case 'hsk':
    case 'hashkeytestnet':
    default:
      return hashkeyTestnet;
  }
}

/**
 * Get supported chains array based on environment configuration
 * @returns {Array} Array of supported chain objects
 */
function getSupportedChains(): Chain[] {
  return [hashkeyTestnet, sepolia, mainnet];
}

export const wagmiConfig = getDefaultConfig({
  appName: 'OmniAgent',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID, // Get from https://cloud.walletconnect.com
  chains: getSupportedChains(),
  ssr: false,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  }),
  // In test mode (Playwright e2e), add mock connector that auto-connects
  // so tests can bypass the wallet connect modal and go straight to the app.
  // The mock connector uses the standard Hardhat/Anvil test account #0.
  connectors: import.meta.env.VITE_PLAYWRIGHT
    ? [mock({ accounts: TEST_ACCOUNTS, features: { defaultConnected: true } })]
    : undefined,
  theme: {
    blurs: {
      modalOverlay: 'blur(4px)',
    },
    colors: {
      accentColor: '#8B5CF6',       // WDK purple
      accentColorForeground: '#FFFFFF',
      actionButtonBorder: '#8B5CF6',
      actionButtonBorderRadius: '8px',
      closeButton: '#8B5CF6',
      closeButtonBackground: 'rgba(139, 92, 246, 0.1)',
      connectButtonBackground: '#8B5CF6',
      connectButtonBackgroundError: '#EF4444',
      connectButtonInnerBackground: '#FFFFFF',
      connectButtonText: '#FFFFFF',
      connectButtonTextError: '#FFFFFF',
      connectionIndicator: '#10B981',
      downloadBottomBoxBackground: '#1F2937',
      downloadTopBoxBackground: '#374151',
      error: '#EF4444',
      generalBorder: '#374151',
      generalBorderRadius: '12px',
      green: '#10B981',
      modalBackdrop: 'rgba(0, 0, 0, 0.5)',
      modalBackground: '#111827',
      modalBorder: '#374151',
      modalText: '#F9FAFB',
      modalTextDim: '#9CA3AF',
      modalTextSecondary: '#9CA3AF',
      profileAction: '#8B5CF6',
      profileActionHover: '#7C3AED',
      profileForeground: '#FFFFFF',
      selectedOptionBorder: '#8B5CF6',
      selectedTokenBorder: '#8B5CF6',
      standby: '#F59E0B',
    },
    fonts: {
      body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      button: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    radii: {
      actionButton: '8px',
      button: '8px',
      modal: '16px',
      modalMobile: '24px',
    },
    shadows: {
      connectButton: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      dialog: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      profileDetailsAction: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      selectedOption: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      selectedToken: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      walletLogo: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
  },
});
