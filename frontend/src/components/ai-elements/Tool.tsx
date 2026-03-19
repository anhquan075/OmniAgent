"use client";;
import { Badge } from "../ui/Badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/Collapsible";
import { cn } from "../../lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export const Tool = ({
  className,
  ...props
}) => (
  <Collapsible
    className={cn("group not-prose mb-4 w-full rounded-md border", className)}
    {...props} />
);

const statusLabels = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons = {
  "approval-requested": <ClockIcon className="size-4 text-[#F3BA2F]" />,
  "approval-responded": <CheckCircleIcon className="size-4 text-cyber-blue" />,
  "input-available": <ClockIcon className="size-4 animate-pulse text-cyber-cyan" />,
  "input-streaming": <CircleIcon className="size-4 text-neutral-gray" />,
  "output-available": <CheckCircleIcon className="size-4 text-tether-teal" />,
  "output-denied": <XCircleIcon className="size-4 text-orange-500" />,
  "output-error": <XCircleIcon className="size-4 text-red-500" />,
};

export const getStatusBadge = (status) => (
  <Badge className="gap-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-white/5 border border-white/10 text-white" variant="outline">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn("flex w-full items-center justify-between gap-4 p-3 hover:bg-white/5 transition-colors group", className)}
      {...props}>
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-white/10 text-neutral-gray-light group-hover:text-tether-teal transition-colors">
          <WrenchIcon className="size-3.5" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-[10px] tracking-widest uppercase text-neutral-gray-light group-hover:text-white transition-colors">
            {title ?? derivedName}
          </span>
          {toolName && (
            <Badge className="gap-1 rounded-full text-[8px] uppercase tracking-wider font-mono bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan px-2 py-0.5" variant="outline">
              {toolName}()
            </Badge>
          )}
        </div>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon
        className="size-4 text-neutral-gray transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export const ToolContent = ({
  className,
  ...props
}) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in border-t border-white/5 bg-black/20",
      className
    )}
    {...props} />
);

export const ToolInput = ({
  className,
  input,
  ...props
}) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <h4
      className="font-heading font-bold text-[8px] uppercase tracking-widest text-neutral-gray mb-1 flex items-center gap-2">
      <CircleIcon className="w-2 h-2 fill-neutral-gray" /> Input Parameters
    </h4>
    <div className="rounded-xl bg-black/40 border border-white/5 p-3">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" className="text-[10px] font-mono text-gray-400" />
    </div>
  </div>
);

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div className="text-[11px] text-gray-300">{output}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" className="text-[10px] font-mono text-tether-teal" />
    );
  } else if (typeof output === "string") {
    // Check if output looks like JSON
    try {
      const parsed = JSON.parse(output);
      Output = <CodeBlock code={JSON.stringify(parsed, null, 2)} language="json" className="text-[10px] font-mono text-tether-teal" />;
    } catch {
      Output = <CodeBlock code={output} language="text" className="text-[10px] font-mono text-tether-teal" />;
    }
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4
        className={cn(
          "font-heading font-bold text-[8px] uppercase tracking-widest mb-1 flex items-center gap-2",
          errorText ? "text-red-500" : "text-tether-teal"
        )}>
        {errorText ? <XCircleIcon className="w-2 h-2" /> : <CheckCircleIcon className="w-2 h-2" />}
        {errorText ? "Execution Error" : "Result Output"}
      </h4>
      <div
        className={cn("overflow-x-auto rounded-xl border p-3 [&_table]:w-full", errorText
          ? "bg-red-500/5 border-red-500/20 text-red-400"
          : "bg-black/40 border-white/5 text-white")}>
        {errorText && <div className="text-[10px] font-mono">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
