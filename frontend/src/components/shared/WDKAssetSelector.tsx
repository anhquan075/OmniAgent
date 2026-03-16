import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';

export function WDKAssetSelector({ 
  isOpen, 
  onClose, 
  onSelect,
  selectedId
}) {
  const assets = [
    { id: 'usdt', name: 'Tether USD', symbol: 'USD₮', icon: '/coins/usdt.png' },
    { id: 'xaut', name: 'Tether Gold', symbol: 'XAU₮', icon: '/coins/xaut.png' },
    { id: 'euro', name: 'Tether Euro', symbol: 'EUR₮', icon: '/coins/eur.png' },
    { id: 'cnh', name: 'Tether CNH', symbol: 'CNH₮', icon: '/coins/cnh.png' },
    { id: 'mxn', name: 'Tether MXN', symbol: 'MXN₮', icon: '/coins/mxn.png' },
  ];

  const [searchTerm, setSearchTerm] = useState('');

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    asset.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full md:w-[480px] bg-space-black border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-heading font-bold text-white">Select WDK Asset</h2>
              <button 
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-neutral-gray hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-neutral-gray focus:outline-none focus:border-tether-teal/50 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    onSelect(asset);
                    onClose();
                  }}
                  className={`
                    w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all group border border-transparent
                    ${selectedId === asset.id ? 'bg-tether-teal/10 border-tether-teal/20' : ''}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 p-1 flex items-center justify-center">
                      <span className="text-[10px] font-bold">{asset.symbol.slice(0, 1)}</span>
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-bold text-white">{asset.name}</span>
                      <span className="text-xs text-neutral-gray">{asset.symbol}</span>
                    </div>
                  </div>
                  {selectedId === asset.id && (
                    <div className="w-2 h-2 rounded-full bg-tether-teal shadow-glow-sm" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
