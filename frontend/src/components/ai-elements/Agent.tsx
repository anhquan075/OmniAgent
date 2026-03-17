"use client";;
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/Accordion";
import { Badge } from "../ui/Badge";
import { cn } from "../../lib/utils";
import { BotIcon } from "lucide-react";
import { memo } from "react";

import { CodeBlock } from "./code-block";

export const Agent = memo((props: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <div
    className={cn("not-prose w-full rounded-md border", props.className)}>
    {props.children}
  </div>
));

export const AgentHeader = memo((props: {
  className?: string;
  name?: string;
  model?: string;
  children?: React.ReactNode;
}) => (
  <div
    className={cn("flex w-full items-center justify-between gap-4 p-3", props.className)}>
    <div className="flex items-center gap-2">
      <BotIcon className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">{props.name}</span>
      {props.model && (
        <Badge className="font-mono text-xs" variant="secondary">
          {props.model}
        </Badge>
      )}
    </div>
  </div>
));

export const AgentContent = memo((props: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <div className={cn("space-y-4 p-4 pt-0", props.className)}>
    {props.children}
  </div>
));

export const AgentInstructions = memo((props: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <div className={cn("space-y-2", props.className)}>
    <span className="font-medium text-muted-foreground text-sm">
      Instructions
    </span>
    <div className="rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
      <p>{props.children}</p>
    </div>
  </div>
));

export const AgentTools = memo((props: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <div className={cn("space-y-2", props.className)}>
    <span className="font-medium text-muted-foreground text-sm">Tools</span>
    <Accordion className="rounded-md border" />
  </div>
));

interface AgentToolProps {
  className?: string;
  tool: { description?: string; jsonSchema?: object; inputSchema?: object };
  value?: string;
  children?: React.ReactNode;
}

export const AgentTool = memo((props: AgentToolProps) => {
  const schema =
    "jsonSchema" in props.tool && props.tool.jsonSchema
      ? props.tool.jsonSchema
      : props.tool.inputSchema;

  return (
    <AccordionItem
      className={cn("border-b last:border-b-0", props.className)}
      value={props.value ?? ''}>
      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
        {props.tool.description ?? "No description"}
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="rounded-md bg-muted/50">
          <CodeBlock code={JSON.stringify(schema, null, 2)} language="json" />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

interface AgentOutputProps {
  className?: string;
  schema?: string;
}

export const AgentOutput = memo((props: AgentOutputProps) => (
  <div className={cn("space-y-2", props.className)}>
    <span className="font-medium text-muted-foreground text-sm">
      Output Schema
    </span>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={props.schema ?? ''} language="typescript" />
    </div>
  </div>
));

Agent.displayName = "Agent";
AgentHeader.displayName = "AgentHeader";
AgentContent.displayName = "AgentContent";
AgentInstructions.displayName = "AgentInstructions";
AgentTools.displayName = "AgentTools";
AgentTool.displayName = "AgentTool";
AgentOutput.displayName = "AgentOutput";
