"use client";

import { Button } from "../ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { cn } from "../../lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createHighlighter, type BundledLanguage, type SpecialLanguage, type Highlighter } from "shiki";

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
// oxlint-disable-next-line eslint(no-bitwise)
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;
// oxlint-disable-next-line eslint(no-bitwise)
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;
const isUnderline = (fontStyle: number | undefined) =>
  // oxlint-disable-next-line eslint(no-bitwise)
  fontStyle && fontStyle & 4;

const addKeysToTokens = (lines: any[]) => lines.map((line: any[], lineIdx: number) => ({
  key: `line-${lineIdx}`,
  tokens: line.map((token: any, tokenIdx: number) => ({
    key: `line-${lineIdx}-${tokenIdx}`,
    token,
  })),
}));

const TokenSpan = ({
  token
}: { token: any }) => (
  <span
    className="bg-transparent"
    style={
      {
        backgroundColor: token.bgColor,
        color: token.color,
        fontStyle: isItalic(token.fontStyle) ? "italic" : undefined,
        fontWeight: isBold(token.fontStyle) ? "bold" : undefined,
        textDecoration: isUnderline(token.fontStyle) ? "underline" : undefined,
        ...token.htmlStyle
      }
    }>
    {token.content}
  </span>
);

const LINE_NUMBER_CLASSES = cn(
  "block",
  "before:content-[counter(line)]",
  "before:inline-block",
  "before:[counter-increment:line]",
  "before:w-8",
  "before:mr-4",
  "before:text-right",
  "before:text-muted-foreground/50",
  "before:font-mono",
  "before:select-none"
);

const LineSpan = ({
  keyedLine,
  showLineNumbers
}: { keyedLine: any, showLineNumbers: boolean }) => (
  <span className={showLineNumbers ? LINE_NUMBER_CLASSES : "block"}>
    {keyedLine.tokens.length === 0
      ? "\n"
      : keyedLine.tokens.map(({ token, key }: any) => (
          <TokenSpan key={key} token={token} />
        ))}
  </span>
);

const CodeBlockContext = createContext<{ code: string }>({
  code: "",
});

const highlighterCache = new Map<string, Promise<Highlighter>>();
const tokensCache = new Map<string, any>();
const subscribers = new Map<string, Set<(tokens: any) => void>>();

const getTokensCacheKey = (code: string, language: string) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${code.length}:${start}:${end}`;
};

const getHighlighter = (language: string) => {
  const cached = highlighterCache.get(language);
  if (cached) {
    return cached;
  }

  const highlighterPromise = createHighlighter({
    langs: [language],
    themes: ["github-light", "github-dark"],
  });

  highlighterCache.set(language, highlighterPromise);
  return highlighterPromise;
};

const createRawTokens = (code: string) => ({
  bg: "transparent",
  fg: "inherit",

  tokens: code.split("\n").map((line) =>
    line === ""
      ? []
      : [
          {
            color: "inherit",
            content: line
          },
        ])
});

export const highlightCode = (
  code: string,
  language: string,
  // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-callbacks)
  callback?: (tokens: any) => void
) => {
  const tokensCacheKey = getTokensCacheKey(code, language);

  const cached = tokensCache.get(tokensCacheKey);
  if (cached) {
    return cached;
  }

  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  // Fire-and-forget async pattern
  getHighlighter(language)
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
    .then((highlighter) => {
      const availableLangs = highlighter.getLoadedLanguages();
      const langToUse = availableLangs.includes(language) ? language : "text";

       const result = highlighter.codeToTokens(code, {
         lang: langToUse as BundledLanguage | SpecialLanguage,
         themes: {
           dark: "github-dark",
           light: "github-light",
         },
       });

      const tokenized = {
        bg: result.bg ?? "transparent",
        fg: result.fg ?? "inherit",
        tokens: result.tokens,
      };

      tokensCache.set(tokensCacheKey, tokenized);

      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        for (const sub of subs) {
          sub(tokenized);
        }
        subscribers.delete(tokensCacheKey);
      }
    })
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then), eslint-plugin-promise(prefer-await-to-callbacks)
    .catch((error) => {
      console.error("Failed to highlight code:", error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};

interface CodeBlockBodyProps {
  tokenized: any;
  showLineNumbers: boolean;
  className?: string;
}

const CodeBlockBody = memo(({
  tokenized,
  showLineNumbers,
  className
}: CodeBlockBodyProps) => {
  const preStyle = useMemo(() => ({
    backgroundColor: tokenized.bg !== 'transparent' ? tokenized.bg : undefined,
    color: tokenized.fg !== 'inherit' ? tokenized.fg : undefined,
  }), [tokenized.bg, tokenized.fg]);

  const keyedLines = useMemo(() => addKeysToTokens(tokenized.tokens), [tokenized.tokens]);

  return (
    <pre
      className={cn(
        "bg-[#0B0E14] text-gray-200 border border-white/10 rounded-lg m-0 p-4 text-sm overflow-x-auto",
        className
      )}
      style={tokenized.bg === 'transparent' ? {} : preStyle}>
      <code
        className={cn(
          "font-mono text-sm",
          showLineNumbers && "[counter-increment:line_0] [counter-reset:line]"
        )}>
        {keyedLines.map((keyedLine) => (
          <LineSpan
            key={keyedLine.key}
            keyedLine={keyedLine}
            showLineNumbers={showLineNumbers} />
        ))}
      </code>
    </pre>
  );
}, (prevProps: CodeBlockBodyProps, nextProps: CodeBlockBodyProps) =>
  prevProps.tokenized === nextProps.tokenized &&
  prevProps.showLineNumbers === nextProps.showLineNumbers &&
  prevProps.className === nextProps.className);

CodeBlockBody.displayName = "CodeBlockBody";

export const CodeBlockContainer = ({
  className,
  language,
  style,
  ...props
}: any) => (
  <div
    className={cn(
      "group relative w-full overflow-hidden rounded-md border border-white/10 bg-[#0B0E14] text-gray-200",
      className
    )}
    data-language={language}
    style={{
      containIntrinsicSize: "auto 200px",
      contentVisibility: "auto",
      ...style,
    }}
    {...props} />
);

export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: any) => (
  <div
    className={cn(
      "flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 text-gray-400 text-xs",
      className
    )}
    {...props}>
    {children}
  </div>
);

export const CodeBlockTitle = ({
  children,
  className,
  ...props
}: any) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

export const CodeBlockFilename = ({
  children,
  className,
  ...props
}: any) => (
  <span className={cn("font-mono", className)} {...props}>
    {children}
  </span>
);

export const CodeBlockActions = ({
  children,
  className,
  ...props
}: any) => (
  <div
    className={cn("-my-1 -mr-1 flex items-center gap-2", className)}
    {...props}>
    {children}
  </div>
);

export const CodeBlockContent = ({
  code,
  language,
  showLineNumbers = false
}: { code: string, language: string, showLineNumbers?: boolean }) => {
  // Memoized raw tokens for immediate display
  const rawTokens = useMemo(() => createRawTokens(code), [code]);

  // Synchronous cache lookup — avoids setState in effect for cached results
  const syncTokens = useMemo(
    () => highlightCode(code, language) ?? rawTokens,
    [code, language, rawTokens]
  );

  // Async highlighting result (populated after shiki loads)
  const [asyncTokens, setAsyncTokens] = useState<any>(null);
  const asyncKeyRef = useRef({ code, language });

  // Invalidate stale async tokens synchronously during render
  if (
    asyncKeyRef.current.code !== code ||
    asyncKeyRef.current.language !== language
  ) {
    asyncKeyRef.current = { code, language };
    setAsyncTokens(null);
  }

  useEffect(() => {
    let cancelled = false;

    highlightCode(code, language, (result) => {
      if (!cancelled) {
        setAsyncTokens(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const tokenized = asyncTokens ?? syncTokens;

  return (
    <div className="relative overflow-auto">
      <CodeBlockBody showLineNumbers={showLineNumbers} tokenized={tokenized} />
    </div>
  );
};

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: any) => {
  const contextValue = useMemo(() => ({ code }), [code]);

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <CodeBlockContainer className={className} language={language} {...props}>
        {children}
        <CodeBlockContent code={code} language={language} showLineNumbers={showLineNumbers} />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  );
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: any) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
      }
    } catch (error) {
      onError?.(error);
    }
  }, [code, onCopy, onError, timeout, isCopied]);

  useEffect(() => () => {
    window.clearTimeout(timeoutRef.current);
  }, []);

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}>
      {children ?? <Icon size={14} />}
    </Button>
  );
};

export const CodeBlockLanguageSelector = (
  props: any
) => <Select {...props} />;

export const CodeBlockLanguageSelectorTrigger = ({
  className,
  ...props
}: any) => (
  <SelectTrigger
    className={cn("h-7 border-none bg-transparent px-2 text-xs shadow-none text-gray-400", className)}
    size="sm"
    {...props} />
);

export const CodeBlockLanguageSelectorValue = (
  props: any
) => <SelectValue {...props} />;

export const CodeBlockLanguageSelectorContent = ({
  align = "end",
  ...props
}: any) => (
  <SelectContent align={align} {...props} />
);

export const CodeBlockLanguageSelectorItem = (
  props: any
) => <SelectItem {...props} />;
