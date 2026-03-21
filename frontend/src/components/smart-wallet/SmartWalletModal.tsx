import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { SmartWalletSetup } from './SmartWalletSetup';
import { SessionKeyManager } from './SessionKeyManager';

interface SmartWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAddress: string;
  smartAccountAddress: string | null;
  onSmartAccountReady: (address: string) => void;
}

export function SmartWalletModal({ 
  isOpen, 
  onClose, 
  userAddress, 
  smartAccountAddress, 
  onSmartAccountReady 
}: SmartWalletModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 z-[100] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative"
          >
            <button
              onClick={onClose}
              className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            {smartAccountAddress ? (
              <SessionKeyManager 
                userAddress={userAddress} 
                smartAccountAddress={smartAccountAddress} 
              />
            ) : (
              <SmartWalletSetup 
                userAddress={userAddress} 
                onSmartAccountReady={onSmartAccountReady} 
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
