import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ZapIcon, ActivityIcon, ShieldCheckIcon, WalletIcon, BarChart3Icon, GlobeIcon, PlusCircle, 
  TrendingUp, BotIcon, LayersIcon, CoinsIcon, LockIcon
} from 'lucide-react';

const ERC4337_ICON = (props: React.ComponentProps<"svg">) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    <circle cx="12" cy="16" r="1" />
  </svg>
);

export interface Command {
  id: string;
  label: string;
  description: string;
  icon: any;
  prompt: string;
  category?: string;
}

export const DEFI_COMMANDS: Command[] = [
  { id: 'status', label: 'status', description: 'Get full vault and rail status', icon: BarChart3Icon, prompt: '/status', category: 'vault' },
  { id: 'rebalance', label: 'rebalance', description: 'Trigger an autonomous rebalance cycle', icon: ZapIcon, prompt: '/rebalance', category: 'engine' },
  { id: 'risk', label: 'risk', description: 'Analyze current risk parameters', icon: ShieldCheckIcon, prompt: '/risk', category: 'engine' },
  { id: 'yield', label: 'yield', description: 'View current yield opportunities', icon: TrendingUp, prompt: '/yield', category: 'aave' },
  { id: 'deposit', label: 'deposit', description: 'Initiate a secure deposit', icon: PlusCircle, prompt: '/deposit', category: 'vault' },
  { id: 'withdraw', label: 'withdraw', description: 'Initiate a secure withdrawal', icon: WalletIcon, prompt: '/withdraw', category: 'vault' },
  { id: 'harvest', label: 'harvest', description: 'Harvest all accrued yield', icon: ActivityIcon, prompt: '/harvest', category: 'aave' },
  { id: 'bridge', label: 'bridge', description: 'Move assets across settlement rails', icon: GlobeIcon, prompt: '/bridge', category: 'bridge' },
  { id: 'balance', label: 'balance', description: 'Check wallet balance on Sepolia', icon: WalletIcon, prompt: 'Check my wallet balance', category: 'sepolia' },
  { id: 'swap', label: 'swap', description: 'Swap tokens on Sepolia', icon: ZapIcon, prompt: 'Swap 10 USDT for ETH', category: 'sepolia' },
  { id: 'robots', label: 'robots', description: 'List available sub-agents', icon: BotIcon, prompt: 'List all available sub-agents', category: 'x402' },
  { id: 'vault-state', label: 'vault state', description: 'Get current vault state', icon: LayersIcon, prompt: 'What is the current vault state?', category: 'vault' },
  { id: 'cycle-state', label: 'cycle state', description: 'Get engine cycle state', icon: ZapIcon, prompt: 'What is the cycle state?', category: 'engine' },
  { id: 'aave-position', label: 'aave position', description: 'Check Aave lending position', icon: CoinsIcon, prompt: 'Check my Aave position', category: 'aave' },
  { id: 'smart-account', label: 'smartAccount', description: 'Get ERC-4337 smart account address', icon: ERC4337_ICON as any, prompt: 'What is my smart account address?', category: 'erc4337' },
  { id: 'prices', label: 'prices', description: 'Get price matrix for trading pairs', icon: TrendingUp, prompt: 'Get current prices for USDT/USDC', category: 'market' },
  { id: 'arb', label: 'arb', description: 'Find best arbitrage opportunity', icon: BarChart3Icon, prompt: 'Find the best arbitrage opportunity', category: 'market' },
  { id: 'bridge-quote', label: 'bridgeQuote', description: 'Get cross-chain bridge quote', icon: GlobeIcon, prompt: 'Get a bridge quote to Arbitrum', category: 'bridge' },
];

interface CommandPaletteProps {
  isOpen: boolean;
  filterText?: string;
  selectedIndex?: number;
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ 
  isOpen, 
  filterText = '', 
  selectedIndex = 0, 
  onSelect 
}) => {
  const filteredCommands = DEFI_COMMANDS.filter(cmd => {
    const label = cmd.label || '';
    const filter = filterText || '';
    return label.toLowerCase().includes(filter.toLowerCase());
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const selectedElement = scrollRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="absolute bottom-full left-0 mb-4 w-72 overflow-hidden rounded-2xl border border-white/10 bg-space-black/80 backdrop-blur-xl shadow-2xl z-[100]"
        >
          <div className="p-2 border-b border-white/5 bg-white/5">
            <span className="text-[8px] font-heading font-bold text-tether-teal tracking-[0.2em] uppercase px-2">
              Command Center
            </span>
          </div>
          
          <div 
            ref={scrollRef}
            className="p-1 max-h-64 overflow-y-auto custom-scrollbar" 
            role="listbox"
          >
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  onClick={() => onSelect(cmd)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 group relative ${
                    idx === selectedIndex 
                      ? 'bg-tether-teal text-space-black shadow-glow-sm' 
                      : 'hover:bg-white/5 text-neutral-gray-light'
                  }`}
                  role="option"
                  aria-selected={idx === selectedIndex}
                >
                  <div className={`p-1.5 rounded-lg ${
                    idx === selectedIndex ? 'bg-space-black/20' : 'bg-white/5 group-hover:scale-110 transition-transform'
                  }`}>
                    <cmd.icon className="w-3.5 h-3.5" />
                  </div>
                  
                  <div className="flex flex-col min-w-0">
                    <span className={`text-[11px] font-bold font-heading tracking-tight ${
                      idx === selectedIndex ? 'text-space-black' : 'text-white'
                    }`}>
                      /{cmd.label}
                    </span>
                    <span className={`text-[9px] truncate ${
                      idx === selectedIndex ? 'text-space-black/60' : 'text-neutral-gray'
                    }`}>
                      {cmd.description}
                    </span>
                  </div>

                  {idx === selectedIndex && (
                    <div className="ml-auto">
                      <ZapIcon className="w-2.5 h-2.5 fill-space-black" />
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <span className="text-[10px] text-neutral-gray italic">No matching commands</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
