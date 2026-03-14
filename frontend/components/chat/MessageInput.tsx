import React, { useState, useRef } from 'react';
import { SendIcon, SparklesIcon, ZapIcon, SquareIcon } from 'lucide-react';
import { CommandPalette, DEFI_COMMANDS, Command } from './CommandPalette';

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
  const [paletteFilter, setPaletteFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = DEFI_COMMANDS.filter(cmd => 
    cmd.label.toLowerCase().includes(paletteFilter.toLowerCase())
  );

  const selectCommand = (command: Command) => {
    const lastSlashIndex = input.lastIndexOf('/');
    const newValue = input.slice(0, lastSlashIndex) + '/' + command.label + ' ';
    
    // Create a synthetic event to trigger handleInputChange
    const event = {
      target: { value: newValue }
    } as React.ChangeEvent<HTMLTextAreaElement>;
    
    handleInputChange(event);
    setIsPaletteOpen(false);
    
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isPaletteOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPaletteOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !isPaletteOpen && status === 'ready') {
      e.preventDefault();
      // Submit the form
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e);

    const value = e.target.value;
    const words = value.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('/')) {
      setIsPaletteOpen(true);
      setPaletteFilter(lastWord.slice(1));
      setSelectedIndex(0);
    } else {
      setIsPaletteOpen(false);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  return (
    <form 
      onSubmit={(e) => {
        e.preventDefault();
        if (status !== 'ready') return;
        setIsPaletteOpen(false);
        handleSubmit(e);
      }} 
      className="flex flex-col gap-2 relative"
    >
      <CommandPalette 
        isOpen={isPaletteOpen}
        filter={paletteFilter}
        selectedIndex={selectedIndex}
        onSelect={selectCommand}
      />

      {/* Input Mode Info */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => setIsHighPriority(!isHighPriority)}
            className={`flex items-center gap-1.5 transition-all duration-300 ${isHighPriority ? 'text-tether-teal animate-pulse' : 'text-neutral-gray-light hover:text-gray-300'}`}
          >
            <ZapIcon className={`w-3 h-3 ${isHighPriority ? 'fill-tether-teal' : ''}`} />
            <span className="text-[8px] font-heading tracking-[0.2em] uppercase">{isHighPriority ? 'Flashbots Mode' : 'Standard'}</span>
          </button>
        </div>
        <div className="text-[8px] font-mono text-neutral-gray uppercase tracking-widest opacity-40">
          {isPaletteOpen ? 'TAB to select' : 'ESC to clear'}
        </div>
      </div>

      <div 
        className={`relative flex items-end gap-2 p-2 rounded-xl transition-all duration-300 backdrop-blur-md bg-white/5 border ${
          isFocused ? 'border-tether-teal/50 shadow-[0_0_15px_rgba(38,161,123,0.15)]' : 'border-white/10'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={onTextareaChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setTimeout(() => setIsFocused(false), 200);
          }}
          placeholder="Command the WDKVault Agent (type / for actions)..."
          disabled={status !== 'ready'}
          className="flex-1 max-h-[150px] min-h-[44px] py-3 px-3 bg-transparent text-gray-100 placeholder-gray-600 font-sans resize-none outline-none scrollbar-thin scrollbar-thumb-white/10"
          rows={1}
        />

        {status === 'streaming' || status === 'submitted' ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop generating"
            className="p-3 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-300 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.2)]"
          >
            <SquareIcon className="w-5 h-5 fill-red-400" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={status !== 'ready' || !input.trim()}
            aria-label="Send message"
            className={`p-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
              input.trim() && status === 'ready'
                ? 'bg-tether-teal text-space-black hover:bg-tether-teal/90 shadow-[0_0_10px_rgba(38,161,123,0.3)]' 
                : 'bg-white/5 text-gray-500 cursor-not-allowed'
            }`}
          >
            {input.trim() ? <SendIcon className="w-5 h-5" /> : <SparklesIcon className="w-5 h-5" />}
          </button>
        )}
      </div>
    </form>
  );
}
