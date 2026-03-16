import { ReactNode } from "react";

export interface ReasoningProps {
  className?: string;
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  children?: ReactNode;
}

export const Reasoning: React.FC<ReasoningProps>;

export interface ReasoningTriggerProps {
  className?: string;
  children?: ReactNode;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
}

export const ReasoningTrigger: React.FC<ReasoningTriggerProps>;

export interface ReasoningContentProps {
  className?: string;
  children?: ReactNode;
}

export const ReasoningContent: React.FC<ReasoningContentProps>;

export interface ReasoningRawContentProps {
  className?: string;
  children?: ReactNode;
}

export const ReasoningRawContent: React.FC<ReasoningRawContentProps>;

export const useReasoning: () => {
  duration?: number;
  isOpen: boolean;
  isStreaming: boolean;
  setIsOpen: (open: boolean) => void;
};
