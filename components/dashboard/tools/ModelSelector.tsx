import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const models = [
  {
    value: "Techie-Tiwari",
    label: "Techie-Tiwari",
  },
  {
    value: "Editron",
    label: "Editron",
  },
  {
    value: "Kund-Li",
    label: "Kund-Li",
  },
  {
    value: "BrainYeed",
    label: "BrainYeed",
  },
];

interface ModelSelectorProps {
  selectedModel: string | null;
  setSelectedModel: (model: string) => void;
}

export function ModelSelector({
  selectedModel,
  setSelectedModel,
}: ModelSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-[200px] justify-between"
        >
          {selectedModel
            ? models.find((model) => model.value === selectedModel)?.label
            : "Select model..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search model..." />
          <CommandEmpty>No model found.</CommandEmpty>
          <CommandGroup>
            {models.map((model) => (
              <CommandItem
                key={model.value}
                onSelect={() => setSelectedModel(model.value)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedModel === model.value ? "opacity-100" : "opacity-0"
                  )}
                />
                {model.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
