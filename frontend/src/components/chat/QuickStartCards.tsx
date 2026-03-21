import { motion } from 'framer-motion';
import {
  WalletIcon,
  BotIcon,
  CoinsIcon,
  TrendingUpIcon,
  Zap,
  ArrowRightLeft,
  Shield,
  Globe
} from 'lucide-react';

interface QuickStartCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  prompt: string;
  color: string;
}

const quickStartCards: QuickStartCard[] = [
  {
    id: 'balance',
    title: 'Check Balance',
    description: 'View wallet balance',
    icon: WalletIcon,
    prompt: 'What is my current wallet balance on Sepolia?',
    color: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'fleet',
    title: 'Robot Fleet',
    description: 'Monitor yield robots',
    icon: BotIcon,
    prompt: 'Show me the current status of my robot fleet.',
    color: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'vault',
    title: 'Vault Position',
    description: 'Check vault NAV',
    icon: CoinsIcon,
    prompt: 'What is the current vault state and buffer utilization?',
    color: 'from-yellow-500/20 to-orange-500/20',
  },
  {
    id: 'yield',
    title: 'Yield Strategy',
    description: 'View active strategies',
    icon: TrendingUpIcon,
    prompt: 'Explain the current yield optimization strategy.',
    color: 'from-green-500/20 to-emerald-500/20',
  },
  {
    id: 'transfer',
    title: 'Transfer',
    description: 'Send tokens',
    icon: ArrowRightLeft,
    prompt: 'How do I transfer USDT to another address?',
    color: 'from-teal-500/20 to-cyan-500/20',
  },
  {
    id: 'security',
    title: 'Risk Analysis',
    description: 'Check risk metrics',
    icon: Shield,
    prompt: 'What are the current risk metrics for my portfolio?',
    color: 'from-red-500/20 to-orange-500/20',
  },
  {
    id: 'bridge',
    title: 'Bridge',
    description: 'Bridge assets',
    icon: Globe,
    prompt: 'Get a quote to bridge 100 USDT to Arbitrum.',
    color: 'from-indigo-500/20 to-purple-500/20',
  },
  {
    id: 'strategy',
    title: 'Auto Strategy',
    description: 'Configure autonomous',
    icon: Zap,
    prompt: 'Start the autonomous yield strategy with default settings.',
    color: 'from-tether-teal/20 to-cyan-500/20',
  },
];

interface QuickStartCardsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickStartCards({ onSelect, disabled }: QuickStartCardsProps) {
  return (
    <div className="px-2 sm:px-4 py-2 sm:py-3">
      <div className="mb-2 sm:mb-3">
        <h3 className="text-[10px] sm:text-xs font-heading text-tether-teal/80 tracking-wider uppercase">
          What can I do?
        </h3>
        <p className="text-[8px] sm:text-[9px] text-gray-500 font-heading tracking-wide mt-0.5 sm:mt-1">
          Click a card to get started
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 overflow-hidden">
        {quickStartCards.map((card, index) => (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => !disabled && onSelect(card.prompt)}
            disabled={disabled}
            className={`
              group relative p-2 sm:p-3 rounded-xl border border-white/5
              bg-gradient-to-br ${card.color}
              hover:border-tether-teal/30 hover:shadow-lg hover:shadow-tether-teal/10
              transition-all duration-300 text-left min-h-[72px] sm:min-h-[88px]
              disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]
            `}
          >
            <div className="flex items-start gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <div className="p-1 sm:p-1.5 rounded-lg bg-white/5 group-hover:bg-tether-teal/20 transition-colors">
                <card.icon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-tether-teal/60 group-hover:text-tether-teal" />
              </div>
            </div>
            <h4 className="text-[9px] sm:text-[10px] font-heading font-semibold text-white/90 tracking-wider mb-0.5">
              {card.title}
            </h4>
            <p className="text-[7px] sm:text-[8px] text-gray-400 leading-tight">
              {card.description}
            </p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
