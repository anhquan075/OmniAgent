import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet, Shield } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function ConnectionModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-space-black border border-tether-teal/30 rounded-2xl shadow-glow-md overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-tether-teal via-cyber-cyan to-tether-teal animate-gradient-x"></div>
              
              <div className="p-6 text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-tether-teal/10 flex items-center justify-center text-tether-teal mb-4 animate-pulse-slow">
                  <Shield className="w-8 h-8" />
                </div>

                <div>
                  <h2 className="text-2xl font-heading font-bold text-white mb-2">
                    Restricted Access
                  </h2>
                  <p className="text-neutral-gray text-sm">
                    You must initialize your WDK Identity to access autonomous strategies.
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-left space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center border border-white/10">
                      <Wallet className="w-4 h-4 text-tether-teal" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Connect Wallet</h3>
                      <p className="text-xs text-neutral-gray">Secure connection via WalletConnect</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <ConnectButton.Custom>
                    {({ openConnectModal, mounted }) => (
                      <button
                        onClick={openConnectModal}
                        disabled={!mounted}
                        className="w-full py-3 rounded-xl bg-tether-teal text-space-black font-heading font-bold uppercase tracking-widest hover:brightness-110 transition-all shadow-glow-sm"
                      >
                        Initialize Identity
                      </button>
                    )}
                  </ConnectButton.Custom>
                  
                  <button
                    onClick={onClose}
                    className="w-full py-2 text-xs text-neutral-gray hover:text-white transition-colors"
                  >
                    Cancel Authentication
                  </button>
                </div>
              </div>

            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
