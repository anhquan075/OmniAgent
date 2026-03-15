import React, { useState, useRef } from 'react';
import { SendIcon, SparklesIcon, ZapIcon, SquareIcon, PlusIcon } from 'lucide-react';
import { CommandPalette, DEFI_COMMANDS, Command } from './CommandPalette';
import { 
  PromptInput, 
  PromptInputBody, 
  PromptInputTextarea, 
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem
} from '../../src/components/ai-elements/prompt-input';
import { cn } from "@/lib/utils";

interface MessageInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  stop: () => void;
}

export function MessageInput({ input, handleInputChange, handleSubmit, status, stop }: MessageInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isHighPriority, setIsHighPriority] = useState(false);
  
  // Command Palette State
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = DEFI_COMMANDS.filter(cmd => 
    (cmd.label || '').toLowerCase().includes((input.startsWith('/') ? input.slice(1) : '').toLowerCase())
  );

  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    handleInputChange(e);
    
    // Auto-open command palette
    if (value.startsWith('/')) {
      setIsPaletteOpen(true);
      setSelectedIndex(0);
    } else {
      setIsPaletteOpen(false);
    }
  };

  const selectCommand = (cmd: Command) => {
    const event = {
      target: { value: cmd.prompt }
    } as any;
    handleInputChange(event);
    setIsPaletteOpen(false);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isPaletteOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
      } else if (e.key === 'Escape') {
        setIsPaletteOpen(false);
      }
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <CommandPalette 
        isOpen={isPaletteOpen} 
        onSelect={selectCommand} 
        onClose={() => setIsPaletteOpen(false)}
        filterText={input.startsWith('/') ? input.slice(1) : ''}
        selectedIndex={selectedIndex}
      />

      <PromptInput
        onSubmit={(_data, e) => handleSubmit(e as any)}
        className={cn(
          "relative flex items-end gap-2 p-2 rounded-2xl bg-[#161B22]/80 backdrop-blur-xl border transition-all duration-300",
          isFocused ? "border-tether-teal/50 shadow-[0_0_20px_rgba(38,161,123,0.15)] bg-[#161B22]" : "border-white/10 shadow-lg",
          isHighPriority && "border-neon-green/40 shadow-[0_0_15px_rgba(57,255,20,0.1)]"
        )}
      >
        <div className="flex items-center self-center pl-1">
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger className="text-neutral-gray hover:text-tether-teal transition-colors" />
            <PromptInputActionMenuContent>
              <PromptInputActionMenuItem onClick={() => setIsHighPriority(!isHighPriority)} className="cursor-pointer">
                <ZapIcon className={cn("mr-2 h-4 w-4", isHighPriority ? "text-neon-green" : "text-gray-400")} />
                <span className="text-xs font-heading uppercase tracking-wider">
                  {isHighPriority ? "Priority: Active" : "Enable Priority"}
                </span>
              </PromptInputActionMenuItem>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
        </div>

        <PromptInputBody className="flex-1">
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={onTextareaChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Command the AFOS Strategist..."
            className="bg-transparent border-none focus-visible:ring-0 min-h-[44px] py-2.5 px-1 text-sm font-sans placeholder:text-neutral-gray/50 resize-none"
          />
        </PromptInputBody>

        <div className="flex items-center gap-2 self-center pr-1">
          {status !== 'ready' && status !== 'error' && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-tether-teal/5 border border-tether-teal/10 animate-pulse">
              <div className="w-1 h-1 rounded-full bg-tether-teal"></div>
              <span className="text-[8px] font-heading font-black text-tether-teal uppercase tracking-widest">Link Active</span>
            </div>
          )}
          
          <PromptInputSubmit 
            status={status} 
            onStop={stop}
            className={cn(
              "h-9 w-9 rounded-xl transition-all duration-300 flex items-center justify-center",
              input.trim() || status !== 'ready'
                ? "bg-tether-teal text-space-black hover:scale-105 active:scale-95 shadow-glow-sm" 
                : "bg-white/5 text-neutral-gray/40 grayscale opacity-50"
            )}
          />
        </div>
      </PromptInput>
    </div>
  );
}
