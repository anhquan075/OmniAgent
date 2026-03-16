import React from "react";
import { Activity } from "lucide-react";
import { ConnectButton } from '@rainbow-me/rainbowkit';

/// Sticky top navbar with branding, network badge, and wallet connect/disconnect controls.
/// RainbowKit ConnectButton handles wallet modal UI — always accessible, never buried under page content.
export function VaultTopNavbar({ busyAction }) {
  return (
    <nav className="topNav">
      {/* Brand */}
      <div className="topNavBrand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="OmniWDK" className="topNavLogo" />
        <div className="topNavBrandText">
          <span className="topNavTitle">OmniWDK <strong>Vault</strong></span>
          <span className="topNavTagline">Autonomous yield protection · on-chain</span>
        </div>
      </div>

      {/* Wallet controls */}
      <div className="topNavWallet">
        {busyAction && (
          <span className="topNavBadge topNavBadge--good">
            <Activity size={11} style={{ marginRight: 4 }} />{busyAction}
          </span>
        )}
        <ConnectButton />
      </div>
    </nav>
  );
}
