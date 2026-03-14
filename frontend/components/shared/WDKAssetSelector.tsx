import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchIcon, XIcon, CheckIcon, ZapIcon } from 'lucide-react';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  chain: string;
  logo: string;
  balance: string;
  isGasless?: boolean;
}

const ASSETS: Asset[] = [
  { id: '1', symbol: 'USD₮', name: 'Tether USD', chain: 'TON', logo: '/coins/ton.png', balance: '1,240.00', isGasless: true },
  { id: '2', symbol: 'USD₮', name: 'Tether USD', chain: 'BNB', logo: '/coins/bnb.png', balance: '450.25' },
  { id: '3', symbol: 'XAU₮', name: 'Tether Gold', chain: 'ETH', logo: '/coins/eth.png', balance: '0.54', isGasless: false },
  { id: '4', symbol: 'USD₮', name: 'Tether USD', chain: 'ARB', logo: '/coins/arb.png', balance: '800.00' },
  { id: '5', symbol: 'USD₮', name: 'Tether USD', chain: 'POL', logo: '/coins/pol.png', balance: '120.00' },
];

interface WDKAssetSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  selectedId?: string;
}

export const WDKAssetSelector: React.FC<WDKAssetSelectorProps> = ({ isOpen, onClose, onSelect, selectedId }) => {
  const [search, setSearch] = useState('');

  const filteredAssets = ASSETS.filter(a => 
    a.symbol.toLowerCase().includes(search.toLowerCase()) || 
    a.chain.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-space-black/60 backdrop-blur-sm z-[110]"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[120] px-4"
          >
            <div className="glass-dark border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-heading font-bold text-white uppercase tracking-widest">Select Settlement Rail</h3>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-neutral-gray transition-colors">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="px-6 py-4">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input 
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search asset or chain..."
                    className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm outline-none focus:border-tether-teal/30 transition-all placeholder:text-neutral-gray"
                  />
                </div>
              </div>

              {/* Asset List */}
              <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
                {filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => { onSelect(asset); onClose(); }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border group ${
                      selectedId === asset.id 
                        ? 'bg-tether-teal/10 border-tether-teal/20' 
                        : 'bg-transparent border-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-black/40 p-1 border border-white/10 flex items-center justify-center overflow-hidden">
                          <img src={asset.logo} className="w-full h-full object-contain" alt="" />
                        </div>
                        {asset.isGasless && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-green flex items-center justify-center shadow-glow-sm">
                            <ZapIcon className="w-2.5 h-2.5 text-black fill-black" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white uppercase">{asset.symbol}</span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-white/5 text-neutral-gray font-heading tracking-widest">{asset.chain}</span>
                        </div>
                        <span className="text-[10px] text-neutral-gray">{asset.name}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-mono font-bold text-white">{asset.balance}</span>
                      {selectedId === asset.id ? (
                        <CheckIcon className="w-4 h-4 text-tether-teal" />
                      ) : asset.isGasless ? (
                        <span className="text-[7px] text-neon-green font-bold uppercase tracking-tighter">Gasless Available</span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 text-center">
                <span className="text-[9px] text-neutral-gray uppercase tracking-widest">
                  WDK Unified Settlement Multi-Chain Protocol
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
