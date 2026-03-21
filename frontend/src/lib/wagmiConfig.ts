import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { createStorage } from 'wagmi';

/**
 * Get the initial chain based on VITE_DEFAULT_NETWORK environment variable
 * @returns {Object} The chain object (sepolia or mainnet)
 */
export function getInitialChain() {
  const network = import.meta.env.VITE_DEFAULT_NETWORK || 'testnet';
  
  switch (network.toLowerCase()) {
    case 'mainnet':
    case 'ethereum':
    case 'eth':
      return mainnet;
    case 'testnet':
    case 'sepolia':
    default:
      return sepolia;
  }
}

/**
 * Get supported chains array based on environment configuration
 * @returns {Array} Array of supported chain objects
 */
function getSupportedChains() {
  return [sepolia];
}

export const wagmiConfig = getDefaultConfig({
  appName: 'OmniAgent',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID, // Get from https://cloud.walletconnect.com
  chains: getSupportedChains(),
  ssr: false,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  }),
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
