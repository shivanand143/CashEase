
"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";

type Option = Record<"value" | "label", string>;

interface MultiSelectProps {
  options: Option[];
  selected: string[]; // Array of selected values (e.g., category slugs/IDs)
  onChange: (selected: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  isLoading = false,
  disabled = false,
  placeholder = "Select...",
  className,
  ...props
}: MultiSelectProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const handleUnselect = React.useCallback((value: string) => {
    onChange(selected.filter((s) => s !== value));
  }, [onChange, selected]);

  const handleSelect = React.useCallback((value: string) => {
    setInputValue("");
    if (!selected.includes(value)) {
      onChange([...selected, value]);
    }
  }, [onChange, selected]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const input = inputRef.current;
    if (input) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (input.value === "" && selected.length > 0) {
          const lastSelected = selected[selected.length - 1];
          handleUnselect(lastSelected);
        }
      }
      // This is not a default behavior of the <input /> field
      if (e.key === "Escape") {
        input.blur();
      }
    }
  }, [handleUnselect, selected]);

  const selectedObjects = React.useMemo(() =>
    options.filter((option) => selected.includes(option.value)),
    [options, selected]
  );

  const selectables = React.useMemo(() =>
     options.filter((option) => !selected.includes(option.value)),
    [options, selected]
  );

  return (
    <Command onKeyDown={handleKeyDown} className={cn("overflow-visible bg-transparent", className)} {...props}>
      <div
        className={cn(
          "group rounded-md border border-input px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
           disabled && "cursor-not-allowed opacity-50"
        )}
         onClick={() => !disabled && inputRef.current?.focus()} // Focus input on div click
      >
        <div className="flex flex-wrap gap-1">
          {selectedObjects.map((option) => (
            <Badge key={option.value} variant="secondary" className="rounded hover:bg-secondary/60">
              {option.label}
              <button
                aria-label={`Remove ${option.label} option`}
                className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUnselect(option.value);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleUnselect(option.value)}
                 disabled={disabled}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </Badge>
          ))}
          {/* Avoid having the clear all X button if there are no options selected */}
          <CommandPrimitive.Input
            ref={inputRef}
            value={inputValue}
            onValueChange={setInputValue}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? placeholder : ""}
            disabled={disabled || isLoading}
            className={cn(
                "ml-2 flex-1 bg-transparent outline-none placeholder:text-muted-foreground",
                selected.length > 0 && "pl-0", // Remove padding left if there are selections
                 isLoading && "cursor-wait"
            )}
            aria-label="Select categories"
          />
          {isLoading && <span className="ml-2 text-xs text-muted-foreground">Loading...</span>}
        </div>
      </div>
      <div className="relative mt-2">
        {open && selectables.length > 0 ? (
          <div className="absolute top-0 z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
            <CommandList>
               <CommandGroup heading={selectables.length ? "Suggestions" : "No results found"} className="h-full overflow-auto">
                {selectables.map((option) => {
                  return (
                    <CommandItem
                      key={option.value}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onSelect={() => {
                        setInputValue("");
                        handleSelect(option.value);
                      }}
                      className={"cursor-pointer"}
                    >
                      {option.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </div>
        ) : null}
      </div>
    </Command>
  );
}
