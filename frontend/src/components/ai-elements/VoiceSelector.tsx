"use client";;
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Button } from "../ui/Button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../ui/Command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/Dialog";
import { Spinner } from "../ui/Spinner";
import { cn } from "../../lib/utils";
import {
  CircleSmallIcon,
  MarsIcon,
  MarsStrokeIcon,
  NonBinaryIcon,
  PauseIcon,
  PlayIcon,
  TransgenderIcon,
  VenusAndMarsIcon,
  VenusIcon,
} from "lucide-react";
import { createContext, useCallback, useContext, useMemo } from "react";

const VoiceSelectorContext = createContext(null);

export const useVoiceSelector = () => {
  const context = useContext(VoiceSelectorContext);
  if (!context) {
    throw new Error("VoiceSelector components must be used within VoiceSelector");
  }
  return context;
};

export const VoiceSelector = ({
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}) => {
  const [value, setValue] = useControllableState({
    defaultProp: defaultValue,
    onChange: onValueChange,
    prop: valueProp,
  });

  const [open, setOpen] = useControllableState({
    defaultProp: defaultOpen,
    onChange: onOpenChange,
    prop: openProp,
  });

  const voiceSelectorContext = useMemo(
    () => ({ open, setOpen, setValue, value }),
    [value, setValue, open, setOpen]
  );

  return (
    <VoiceSelectorContext.Provider value={voiceSelectorContext}>
      <Dialog onOpenChange={setOpen} open={open} {...props}>
        {children}
      </Dialog>
    </VoiceSelectorContext.Provider>
  );
};

export const VoiceSelectorTrigger = (props) => (
  <DialogTrigger {...props} />
);

export const VoiceSelectorContent = ({
  className,
  children,
  title = "Voice Selector",
  ...props
}) => (
  <DialogContent aria-describedby={undefined} className={cn("p-0", className)} {...props}>
    <DialogTitle className="sr-only">{title}</DialogTitle>
    <Command className="**:data-[slot=command-input-wrapper]:h-auto">
      {children}
    </Command>
  </DialogContent>
);

export const VoiceSelectorDialog = (props) => (
  <CommandDialog {...props} />
);

export const VoiceSelectorInput = ({
  className,
  ...props
}) => (
  <CommandInput className={cn("h-auto py-3.5", className)} {...props} />
);

export const VoiceSelectorList = (props) => (
  <CommandList {...props} />
);

export const VoiceSelectorEmpty = (props) => (
  <CommandEmpty {...props} />
);

export const VoiceSelectorGroup = (props) => (
  <CommandGroup {...props} />
);

export const VoiceSelectorItem = ({
  className,
  ...props
}) => (
  <CommandItem className={cn("px-4 py-2", className)} {...props} />
);

export const VoiceSelectorShortcut = (props) => (
  <CommandShortcut {...props} />
);

export const VoiceSelectorSeparator = (props) => (
  <CommandSeparator {...props} />
);

export const VoiceSelectorGender = ({
  className,
  value,
  children,
  ...props
}) => {
  let icon = null;

  switch (value) {
    case "male": {
      icon = <MarsIcon className="size-4" />;
      break;
    }
    case "female": {
      icon = <VenusIcon className="size-4" />;
      break;
    }
    case "transgender": {
      icon = <TransgenderIcon className="size-4" />;
      break;
    }
    case "androgyne": {
      icon = <MarsStrokeIcon className="size-4" />;
      break;
    }
    case "non-binary": {
      icon = <NonBinaryIcon className="size-4" />;
      break;
    }
    case "intersex": {
      icon = <VenusAndMarsIcon className="size-4" />;
      break;
    }
    default: {
      icon = <CircleSmallIcon className="size-4" />;
    }
  }

  return (
    <span className={cn("text-muted-foreground text-xs", className)} {...props}>
      {children ?? icon}
    </span>
  );
};

export const VoiceSelectorAccent = ({
  className,
  value,
  children,
  ...props
}) => {
  let emoji = null;

  switch (value) {
    case "american": {
      emoji = "US";
      break;
    }
    case "british": {
      emoji = "UK";
      break;
    }
    case "australian": {
      emoji = "AU";
      break;
    }
    case "canadian": {
      emoji = "CA";
      break;
    }
    case "irish": {
      emoji = "IE";
      break;
    }
    case "scottish": {
      emoji = "SCO";
      break;
    }
    case "indian": {
      emoji = "IN";
      break;
    }
    case "south-african": {
      emoji = "ZA";
      break;
    }
    case "new-zealand": {
      emoji = "NZ";
      break;
    }
    case "spanish": {
      emoji = "ES";
      break;
    }
    case "french": {
      emoji = "FR";
      break;
    }
    case "german": {
      emoji = "DE";
      break;
    }
    case "italian": {
      emoji = "IT";
      break;
    }
    case "portuguese": {
      emoji = "PT";
      break;
    }
    case "brazilian": {
      emoji = "BR";
      break;
    }
    case "mexican": {
      emoji = "MX";
      break;
    }
    case "argentinian": {
      emoji = "AR";
      break;
    }
    case "japanese": {
      emoji = "JP";
      break;
    }
    case "chinese": {
      emoji = "CN";
      break;
    }
    case "korean": {
      emoji = "KR";
      break;
    }
    case "russian": {
      emoji = "RU";
      break;
    }
    case "arabic": {
      emoji = "SA";
      break;
    }
    case "dutch": {
      emoji = "NL";
      break;
    }
    case "swedish": {
      emoji = "SE";
      break;
    }
    case "norwegian": {
      emoji = "NO";
      break;
    }
    case "danish": {
      emoji = "DK";
      break;
    }
    case "finnish": {
      emoji = "FI";
      break;
    }
    case "polish": {
      emoji = "PL";
      break;
    }
    case "turkish": {
      emoji = "TR";
      break;
    }
    case "greek": {
      emoji = "GR";
      break;
    }
    default: {
      emoji = null;
    }
  }

  return (
    <span className={cn("text-muted-foreground text-xs", className)} {...props}>
      {children ?? emoji}
    </span>
  );
};

export const VoiceSelectorAge = ({
  className,
  ...props
}) => (
  <span
    className={cn("text-muted-foreground text-xs tabular-nums", className)}
    {...props} />
);

export const VoiceSelectorName = ({
  className,
  ...props
}) => (
  <span
    className={cn("flex-1 truncate text-left font-medium", className)}
    {...props} />
);

export const VoiceSelectorDescription = ({
  className,
  ...props
}) => (
  <span className={cn("text-muted-foreground text-xs", className)} {...props} />
);

export const VoiceSelectorAttributes = ({
  className,
  children,
  ...props
}) => (
  <div className={cn("flex items-center text-xs", className)} {...props}>
    {children}
  </div>
);

export const VoiceSelectorBullet = ({
  className,
  ...props
}) => (
  <span
    aria-hidden="true"
    className={cn("select-none text-border", className)}
    {...props}>
    &bull;
  </span>
);

export const VoiceSelectorPreview = ({
  className,
  playing,
  loading,
  onPlay,
  onClick,
  ...props
}) => {
  const handleClick = useCallback((event) => {
    event.stopPropagation();
    onClick?.(event);
    onPlay?.();
  }, [onClick, onPlay]);

  let icon = <PlayIcon className="size-3" />;

  if (loading) {
    icon = <Spinner className="size-3" />;
  } else if (playing) {
    icon = <PauseIcon className="size-3" />;
  }

  return (
    <Button
      aria-label={playing ? "Pause preview" : "Play preview"}
      className={cn("size-6", className)}
      disabled={loading}
      onClick={handleClick}
      size="icon-sm"
      type="button"
      variant="outline"
      {...props}>
      {icon}
    </Button>
  );
};
