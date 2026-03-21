import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Bot, Wallet, Layers, Zap, EyeOff } from 'lucide-react';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ElementType;
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: 'MCP Tools',
    description: 'Access 23 blockchain tools for Sepolia, WDK Vault, and ERC-4337 smart accounts. Click any tool to execute instantly.',
    icon: Layers,
  },
  {
    title: 'Strategist Terminal',
    description: 'Chat with the AI strategist. Ask questions about yield strategies, check balances, or execute transactions.',
    icon: Zap,
  },
  {
    title: 'Robot Fleet',
    description: 'Monitor your autonomous robot fleet executing yield strategies across chains. Watch real-time performance.',
    icon: Bot,
  },
  {
    title: 'Connect Wallet',
    description: 'Connect your wallet to start using the platform. Your keys stay safe - we never custody your assets.',
    icon: Wallet,
  },
];

interface OnboardingTooltipProps {
  isOpen: boolean;
  onComplete: () => void;
  onNeverShowAgain: () => void;
}

export function OnboardingTooltip({ isOpen, onComplete, onNeverShowAgain }: OnboardingTooltipProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    setTimeout(onComplete, 300);
  };

  const handleNeverShow = () => {
    setIsVisible(false);
    setTimeout(onNeverShowAgain, 300);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!isOpen || !isVisible) return null;

  const step = onboardingSteps[currentStep];

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md"
          >
            <div className="rounded-2xl bg-space-black/95 border border-tether-teal/30 shadow-2xl shadow-tether-teal/20 overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-tether-teal/20 text-tether-teal border border-tether-teal/20">
                      <step.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading text-sm font-semibold text-white tracking-wider">
                        {step.title}
                      </h3>
                      <p className="text-[9px] text-tether-teal/60 font-heading tracking-widest uppercase mt-0.5">
                        Step {currentStep + 1} of {onboardingSteps.length}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSkip}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm text-gray-300 leading-relaxed mb-6">
                  {step.description}
                </p>

                <div className="flex items-center justify-between">
                  <button
                    onClick={handleNeverShow}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                  >
                    <EyeOff className="w-3 h-3" />
                    Never show again
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5 mr-4">
                      {onboardingSteps.map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            i === currentStep ? 'bg-tether-teal shadow-[0_0_6px_rgba(38,161,123,0.6)]' : 'bg-white/20'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tether-teal hover:bg-tether-teal/80 text-white text-xs font-semibold transition-colors shadow-lg shadow-tether-teal/20"
                    >
                      {currentStep === onboardingSteps.length - 1 ? 'Get Started' : 'Next'}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
