import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlertIcon, ActivityIcon, CoinsIcon, BarChart3Icon, ZapIcon, WalletIcon, LayoutDashboardIcon, ShieldCheckIcon, GlobeIcon, ServerIcon, LinkIcon, BrainCircuitIcon, MenuIcon, XIcon } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatContainer } from "../components/chat/ChatContainer";
import { ChatHistorySidebar } from "../components/chat/ChatHistorySidebar";
import { WDKBalance } from "../components/shared/WDKBalance";
import { WDKAssetSelector } from "../components/shared/WDKAssetSelector";
import { GuestSplash } from "../components/shared/GuestSplash";
import { ConnectionModal } from "../components/shared/ConnectionModal";

const BentoCard = ({ title, icon: Icon, children, className = "" }) => (
  <div className={`glass rounded-2xl p-3 sm:p-4 md:p-5 flex flex-col gap-3 sm:gap-4 shadow-glow-sm hover:shadow-glow-md transition-all duration-500 group ${className}`}>
    <div className="flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-white/5 text-tether-teal group-hover:scale-110 transition-transform font-heading">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-heading text-[10px] tracking-[0.2em] text-neutral-gray-light uppercase">{title}</h3>
      </div>
      <div className="w-1.5 h-1.5 rounded-full bg-tether-teal/40 shadow-[0_0_8px_rgba(38,161,123,0.4)]"></div>
    </div>
    <div className="flex-1 min-h-0 relative">
      {children}
    </div>
  </div>
);

const INITIAL_SESSION_ID = 'session-' + Date.now();

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const { address, isConnected } = useAccount();

  // Local state for input as per modern ai-sdk best practices
  const [input, setInput] = useState('');

  // Live Stats Fetching
  const { data: stats } = useQuery({
    queryKey: ['agent-stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Stats fetch failed');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const agentState = stats?.system?.isPaused ? 'IDLE' : (stats?.system?.canExecute ? 'EXECUTING' : (stats?.system ? 'SCANNING' : 'IDLE'));
  
  const [sessions, setSessions] = useState([
    { id: INITIAL_SESSION_ID, title: 'Strategy Setup', lastMessage: 'WDK Monitoring Active', timestamp: new Date() }
  ]);
  const [activeSessionId, setActiveSessionId] = useState(INITIAL_SESSION_ID);

  const { messages, sendMessage, status, setMessages, data, stop, regenerate, error, addToolOutput } = useChat({
    api: '/api/chat',
    id: activeSessionId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    initialMessages: [
      {
        id: "initial-1",
        role: "assistant",
        content: "System initialized. I am your **Tether WDK Strategist**. I am currently monitoring cross-chain liquidity for USD₮ and XAU₮ yield optimization.",
        parts: [{ type: 'text', text: "System initialized. I am your **Tether WDK Strategist**. I am currently monitoring cross-chain liquidity for USD₮ and XAU₮ yield optimization." }]
      }
    ],
    dataPartSchemas: {
      'data-status': z.object({
        status: z.string(),
        progress: z.number(),
        thought: z.string().optional()
      }),
      'data-notification': z.object({
        level: z.enum(['info', 'warning', 'error']),
        message: z.string()
      }),
      'data-suggestions': z.array(z.object({
        label: z.string(),
        prompt: z.string()
      }))
    },
    onData: (dataPart) => {

      if (dataPart.type === 'data-notification') {
        console.log(`[Notification] ${dataPart.data.level}: ${dataPart.data.message}`);
      }
    },
    onError: (err) => {
      console.error("[App] useChat Error:", err);
    }
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const initialUpdatedRef = useRef(false);

  // Update initial message when wallet connects or stats arrive
  useEffect(() => {
    if (isConnected && address && messages?.length === 1 && messages[0].id === "initial-1" && !initialUpdatedRef.current) {
      const portfolioMsg = stats?.vault?.totalAssets 
        ? ` My sensors indicate a total vault value of **${stats.vault.totalAssets} USD₮** with **${(stats.risk?.drawdownBps || 0) / 100}%** expected drawdown.`
        : "";

      initialUpdatedRef.current = true;
      setMessages([
        {
          id: "initial-1",
          role: "assistant",
          content: `System initialized. Welcome back, Commander **${address.slice(0, 6)}...${address.slice(-4)}**. I am your **WDK Autonomous Strategist**. All settlement rails are hot.${portfolioMsg}`,
          parts: [{ type: 'text', text: `System initialized. Welcome back, Commander **${address.slice(0, 6)}...${address.slice(-4)}**. I am your **WDK Autonomous Strategist**. All settlement rails are hot.${portfolioMsg}` }]
        }
      ]);
    }
  }, [isConnected, address, setMessages, stats, messages?.length]);

  // Reset initialUpdatedRef when session changes
  useEffect(() => {
    initialUpdatedRef.current = false;
  }, [activeSessionId]);

  // Automatically close ConnectionModal when connected
  useEffect(() => {
    if (isConnected) {
      setIsConnectionModalOpen(false);
    }
  }, [isConnected]);

  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newSession = { id: newId, title: 'New Command', lastMessage: 'No commands yet', timestamp: new Date() };
    
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    initialUpdatedRef.current = false;
    
    setMessages([
      {
        id: "initial-" + newId,
        role: "assistant",
        content: "New session started. Standing by for WDK instructions.",
        parts: [{ type: 'text', text: "New session started. Standing by for WDK instructions." }]
      }
    ]);
    
    setIsMobileMenuOpen(false);
  };

  // Sync session last message and state
  useEffect(() => {
    if (messages && messages.length > 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        let content = "Command sent";
        if (typeof lastMsg.content === 'string') {
          content = lastMsg.content;
        } else if (lastMsg.parts) {
          content = lastMsg.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('');
        }
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, lastMessage: content } : s));
      }
    }
  }, [messages, activeSessionId]);

  const onInputChange = (e) => {
    setInput(e.target.value);
  };

  const onHandleSubmit = async (e, overrideText) => {
    if (e && e.preventDefault) e.preventDefault();
    
    const text = (overrideText || input).trim();
    if (!text) return;

    // If the strategist is stuck or still "streaming", force a stop 
    // before sending the next command to prevent UI locking.
    if (status === 'streaming' || status === 'submitted') {
      stop();
    }

    setInput('');
    
    try {
      // Small delay to ensure the previous stream is fully aborted
      await new Promise(resolve => setTimeout(resolve, 50));
      await sendMessage({ text });
    } catch (err) {
      console.error("[App] Failed to send message:", err);
    }
  };

  const handleRestrictedAction = (e) => {
    if (!isConnected) {
      e.preventDefault();
      e.stopPropagation();
      setIsConnectionModalOpen(true);
    }
  };

  return (
    <div className="h-screen w-full bg-space-black text-white font-sans flex flex-col items-center selection:bg-tether-teal/30 overflow-hidden">
      
      <AnimatePresence>
        {!isConnected && <GuestSplash key="splash" />}
      </AnimatePresence>

      <ConnectionModal 
        isOpen={isConnectionModalOpen} 
        onClose={() => setIsConnectionModalOpen(false)} 
      />

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-tether-teal/5 rounded-full blur-[100px] will-change-transform opacity-40"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-xaut-gold/5 rounded-full blur-[100px] will-change-transform opacity-40"></div>
      </div>

      {/* 
          Dashboard Container with Action Gate 
          When not connected, clicking anywhere on the blurred dashboard triggers the modal.
      */}
      <div 
        onClick={!isConnected ? handleRestrictedAction : undefined}
        className={`w-full h-full flex flex-col relative z-10 p-3 md:p-6 overflow-hidden transition-all duration-1000 ${!isConnected ? 'blur-2xl scale-110 opacity-30 cursor-pointer' : 'blur-0 scale-100 opacity-100'}`}
      >
        
        <header className="h-14 md:h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-6 glass rounded-2xl border border-white/10 mb-3 md:mb-4 shadow-glow-sm relative z-50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-space-black flex items-center justify-center shadow-glow-md overflow-hidden border border-tether-teal/20">
              <img src="/imgs/mascot-owl-no-bg.png" alt="OmniWDK" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm md:text-lg font-heading font-bold tracking-tight bg-clip-text text-transparent bg-[linear-gradient(135deg,#26A17B,#00D1FF)] uppercase truncate max-w-[150px] md:max-w-none">OmniWDK</h1>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-tether-teal"></span>
                <span className="text-[7px] md:text-[9px] font-heading tracking-widest text-neutral-gray-light uppercase">Strategist Active</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-6">
            <div className="hidden xl:block">
              <WDKBalance amount={Number(stats?.vault?.totalAssets || 0)} symbol="USD₮" className="items-end" />
            </div>
            <div className="h-8 border-l border-white/10 mx-1 md:mx-2 hidden lg:block"></div>
            
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 mr-2 shadow-glow-sm">
              <div className="w-5 h-5 rounded-full bg-[#F3BA2F]/10 flex items-center justify-center border border-[#F3BA2F]/20">
                <img src="/coins/bnb.png" alt="BNB Chain" className="w-3.5 h-3.5 object-contain" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[9px] font-bold text-[#F3BA2F] uppercase">BNB Chain</span>
                <span className="text-[7px] text-neutral-gray uppercase tracking-wider">Testnet</span>
              </div>
            </div>

            <div className="scale-75 md:scale-100 origin-right">
              <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-white/5 border border-white/10 text-tether-teal"
            >
              {isMobileMenuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row gap-3 md:gap-6 relative overflow-hidden">

          {/* Column 1: Monitoring */}
          <div className={`
            ${isMobileMenuOpen ? 'fixed inset-0 top-[68px] md:top-[80px] z-40 bg-space-black/95 p-6 overflow-y-auto' : 'hidden'} 
            lg:relative lg:inset-auto lg:flex lg:flex-[2.5] xl:flex-[2] lg:flex-col lg:gap-4 xl:gap-6 lg:min-w-0 lg:min-h-0 lg:bg-transparent lg:overflow-hidden
          `}>
            <BentoCard title="WDK Performance" icon={BarChart3Icon} className="h-[120px] md:h-[140px] shrink-0">
              <div className="flex flex-col h-full justify-center">
                <div className="text-3xl md:text-4xl font-heading font-bold text-tether-teal">
                  {stats?.risk?.sharpe ? stats.risk.sharpe.toFixed(2) : "---"}
                  <span className="text-xs ml-2 text-neutral-gray font-sans font-normal lowercase tracking-normal">Sharpe</span>
                </div>
                <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-tether-teal shadow-glow-sm"
                    animate={{ width: `${Math.min((stats?.risk?.sharpe || 0) * 20, 100)}%` }}
                  />
                </div>
              </div>
            </BentoCard>

            <div className="flex-1 min-h-0 glass-dark rounded-3xl overflow-hidden border border-white/10 relative mt-4 lg:mt-0">
              <ChatHistorySidebar 
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={(id) => { setActiveSessionId(id); setIsMobileMenuOpen(false); }}
                onNewChat={handleNewChat}
                onDeleteSession={(id) => setSessions(s => s.filter(x => x.id !== id))}
              />
            </div>
          </div>

          {/* Column 2: Agent Terminal */}
          <div className={`flex-[7] xl:flex-[6] flex flex-col min-w-0 min-h-0 glass-dark rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative ${isMobileMenuOpen ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex-1 flex flex-col min-h-0">
              <ChatContainer
                messages={messages}
                isLoading={isLoading}
                status={status}
                input={input}
                handleInputChange={onInputChange}
                handleSubmit={onHandleSubmit}
                sendMessage={sendMessage}
                addToolOutput={addToolOutput}
                setMessages={setMessages}
                regenerate={regenerate}
                stop={stop}
                error={error}
                data={data}
              />
            </div>
          </div>

          {/* Column 3: Operational State */}
          <div className={`
            ${isMobileMenuOpen ? 'fixed inset-0 top-[68px] md:top-[80px] z-40 bg-space-black/95 p-6 overflow-y-auto' : 'hidden'} 
            xl:relative xl:inset-auto xl:flex xl:flex-[2.5] 2xl:flex-[2] xl:flex-col xl:gap-4 2xl:gap-6 xl:min-w-0 xl:min-h-0 xl:bg-transparent xl:overflow-hidden xl:pl-1
          `}>
            <BentoCard title="WDK Portfolio" icon={WalletIcon} className="min-h-[220px] shrink-0">
              <div className="flex flex-col gap-6">
                <WDKBalance amount={Number(stats?.vault?.totalAssets || 0)} symbol="USD₮" />
                
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-neutral-gray lowercase">Buffer (USDT)</span>
                    <span className="text-tether-teal">{((Number(stats?.vault?.bufferCurrent || 0) / Number(stats?.vault?.totalAssets || 1)) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-tether-teal"
                      animate={{ width: `${(Number(stats?.vault?.bufferCurrent || 0) / Number(stats?.vault?.totalAssets || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-neutral-gray lowercase">Strategy Exposure</span>
                    <span className="text-cyber-cyan">{((Number(stats?.system?.targetAsterBps || 0) / 10000) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-cyber-cyan"
                      animate={{ width: `${(Number(stats?.system?.targetAsterBps || 0) / 10000) * 100}%` }}
                    />
                  </div>
                </div>

                <button 
                  onClick={() => setIsAssetSelectorOpen(true)}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-heading font-bold text-tether-teal transition-all uppercase tracking-widest cursor-pointer"
                >
                  Manage Settlement Rails
                </button>
              </div>
            </BentoCard>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-1">
              <BentoCard title="Settlement Rails" icon={GlobeIcon} className="min-h-[280px] shrink-0">
                <div className="grid grid-cols-2 gap-2 px-1">
                  {[
                    { name: 'BNB', status: stats?.system?.isPaused ? 'Paused' : 'Online', color: stats?.system?.isPaused ? 'bg-red-500' : 'bg-neon-green', logo: '/coins/bnb.png' },
                    { name: 'ETH', status: 'Online', color: 'bg-neon-green', logo: '/coins/eth.png' },
                    { name: 'SOL', status: 'Online', color: 'bg-neon-green', logo: '/coins/sol.png' },
                    { name: 'TON', status: 'Online', color: 'bg-neon-green', logo: '/coins/ton.png', isGasless: true },
                    { name: 'POL', status: 'Online', color: 'bg-neon-green', logo: '/coins/pol.png' },
                    { name: 'ARB', status: 'Optimal', color: 'bg-cyber-cyan', logo: '/coins/arb.png' }
                  ].map((rail) => (
                    <div key={rail.name} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1.5 hover:bg-white/10 transition-all group relative cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-5 h-5 rounded-full bg-black p-0.5 border border-white/5 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-110 transition-transform">
                            <img src={rail.logo} alt={rail.name} className="w-full h-full object-contain" />
                          </div>
                          <span className="text-[10px] font-bold text-white truncate">{rail.name}</span>
                        </div>
                        <div className={`w-1 h-1 rounded-full ${rail.color} shadow-glow-sm flex-shrink-0`}></div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[7px] text-neutral-gray uppercase tracking-tighter truncate">{rail.status}</span>
                        {rail.isGasless && <ZapIcon className="w-2 h-2 text-neon-green fill-neon-green" />}
                      </div>
                    </div>
                  ))}
                </div>
              </BentoCard>

              <BentoCard title="WDK Activity Log" icon={ActivityIcon} className="flex-1 min-h-[300px]">
                <div className="w-full overflow-hidden">
                  <div className="flex flex-col gap-3">
                    {stats?.system?.canExecute ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/20">
                          <div className="flex items-center gap-3">
                            <ZapIcon className="w-3 h-3 text-cyber-cyan" />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase">Rebalance Ready</span>
                              <span className="text-[8px] text-neutral-gray font-mono">Execute via Terminal</span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => onHandleSubmit(e, "execute_rebalance")}
                          className="w-full py-2.5 rounded-xl bg-cyber-cyan text-space-black text-[10px] font-heading font-bold uppercase tracking-[0.2em] hover:bg-cyber-cyan/80 transition-all shadow-glow-sm cursor-pointer"
                        >
                          Execute Strategy
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 py-8 text-center border border-dashed border-white/5 rounded-xl">
                        <span className="text-[9px] text-neutral-gray uppercase tracking-widest">Awaiting onchain events</span>
                      </div>
                    )}
                  </div>
                </div>
              </BentoCard>
            </div>
          </div>

        </div>

        <footer className="h-10 md:h-12 flex-shrink-0 flex items-center justify-between mt-2 md:mt-4 px-2 opacity-40">
          <p className="text-[7px] md:text-[9px] font-heading tracking-[0.2em] md:tracking-[0.3em] text-neutral-gray uppercase truncate mr-4">
            Economic Infrastructure Powered by Tether WDK
          </p>
          <div className="flex items-center gap-2 md:gap-4 text-[7px] md:text-[9px] font-mono whitespace-nowrap">
            <span className="hidden sm:inline">NETWORK: <span className="text-tether-teal uppercase">Multi-Chain</span></span>
            <span>SETTLEMENT: <span className="text-cyber-cyan uppercase">{stats?.system?.isPaused ? 'PAUSED' : 'ONLINE'}</span></span>
          </div>
        </footer>

        <WDKAssetSelector 
          isOpen={isAssetSelectorOpen} 
          onClose={() => setIsAssetSelectorOpen(false)}
          onSelect={(asset) => setSelectedAsset(asset)}
          selectedId={selectedAsset?.id}
        />

      </div>
    </div>
  );
}
