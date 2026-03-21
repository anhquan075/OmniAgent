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
    <div className="px-2 py-1.5">
      <div className="mb-1.5">
        <h3 className="text-[9px] font-heading text-tether-teal/80 tracking-wider uppercase">
          What can I do?
        </h3>
      </div>

      <div className="grid grid-cols-4 gap-1 overflow-hidden">
        {quickStartCards.map((card, index) => (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => !disabled && onSelect(card.prompt)}
            disabled={disabled}
            className={`
              group relative p-1.5 rounded-lg border border-white/5
              bg-gradient-to-br ${card.color}
              hover:border-tether-teal/30 hover:shadow-lg hover:shadow-tether-teal/10
              transition-all duration-300 text-left min-h-[52px]
              disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]
            `}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <card.icon className="w-2.5 h-2.5 text-tether-teal/60 group-hover:text-tether-teal" />
              <h4 className="text-[8px] font-heading font-semibold text-white/90 tracking-wider truncate">
                {card.title}
              </h4>
            </div>
            <p className="text-[7px] text-gray-400 leading-tight line-clamp-2">
              {card.description}
            </p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
