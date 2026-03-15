import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import "./globals.css";
import App from "./App.jsx";
import { wagmiConfig } from "../lib/wagmiConfig.js";
import { TooltipProvider } from "../components/ui/tooltip";

const queryClient = new QueryClient();

// Tether WDK brand theme for RainbowKit wallet modal
const tetherTheme = darkTheme({
  accentColor: '#26A17B', // tether-teal
  accentColorForeground: '#F8F9FA', 
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small',
});

// Customizing colors to match OmniWDK (WDK Edition) palette
tetherTheme.colors.modalBackground = '#0B0E11';
tetherTheme.colors.modalBorder = 'rgba(38, 161, 123, 0.2)';
tetherTheme.colors.modalText = '#F8F9FA';
tetherTheme.colors.modalTextDim = '#AAAAAA';
tetherTheme.colors.menuItemBackground = 'rgba(38, 161, 123, 0.05)';
tetherTheme.colors.profileAction = 'rgba(38, 161, 123, 0.08)';
tetherTheme.colors.profileActionHover = 'rgba(38, 161, 123, 0.15)';
tetherTheme.colors.profileForeground = '#1E2329';
tetherTheme.colors.connectButtonBackground = '#0B0E11';
tetherTheme.colors.connectButtonInnerBackground = '#1E2329';
tetherTheme.colors.connectButtonText = '#F8F9FA';
tetherTheme.colors.connectionIndicator = '#26A17B';
tetherTheme.colors.selectedOptionBorder = 'rgba(38, 161, 123, 0.4)';
tetherTheme.colors.standby = '#26A17B';

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={tetherTheme}>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
