"use client";

import * as React from "react";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { useCreateTag, useTags } from "@tradstry/app-ui/hooks/tags";
import type { TagCategory } from "@tradstry/app-ui/lib/types/tags";
import { cn } from "@tradstry/app-ui/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fallback color when neither tag nor category has a color. */
const DEFAULT_COLOR = "#6b7280";

// ---------------------------------------------------------------------------
// TagPicker
// ---------------------------------------------------------------------------

export interface TagPickerProps {
  /** The category this picker belongs to. */
  category: TagCategory;
  /** Currently selected tag ids within this category. */
  selectedTagIds: string[];
  /** Called whenever the selection changes. */
  onChange: (ids: string[]) => void;
  /** Optional extra class applied to the root wrapper. */
  className?: string;
}

/**
 * A multiselect chip/combobox for a single tag category.
 *
 * - Selected tags and the add button share a wrapping row.
 * - The popover lists all tags in the category, filtered by a search input.
 * - "Create tag" inline option appears when the search term doesn't match any
 *   existing tag; calls `useCreateTag` and auto-selects the new tag.
 */
export function TagPicker({
  category,
  selectedTagIds,
  onChange,
  className,
}: TagPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const tagsQuery = useTags(category.id);
  const createTag = useCreateTag();

  const allTags = tagsQuery.data ?? [];

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, search]);

  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === search.trim().toLowerCase(),
  );
  const canCreate = search.trim().length > 0 && !exactMatch;

  function toggleTag(id: string) {
    if (selectedTagIds.includes(id)) {
      onChange(selectedTagIds.filter((x) => x !== id));
    } else {
      onChange([...selectedTagIds, id]);
    }
  }

  function removeTag(id: string) {
    onChange(selectedTagIds.filter((x) => x !== id));
  }

  async function handleCreate() {
    const name = search.trim();
    if (!name) return;
    try {
      const created = await createTag.mutateAsync({
        categoryId: category.id,
        name,
        color: null,
      });
      onChange([...selectedTagIds, created.id]);
      setSearch("");
    } catch {
      // createTag errors are surfaced by the mutation; nothing else to do here.
    }
  }

  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));
  const categoryColor = category.color ?? null;

  return (
    <div
      className={cn(
        "flex min-h-7 min-w-0 flex-wrap items-center gap-1.5",
        className,
      )}
    >
      {/* Selected tag chips */}
      {selectedTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="h-7 min-w-0 max-w-full gap-1.5 border-border/70 bg-muted/60 pl-2.5 pr-0.5 text-xs font-normal text-foreground transition-colors"
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: tag.color ?? categoryColor ?? DEFAULT_COLOR,
            }}
          />
          <span className="min-w-0 truncate" title={tag.name}>
            {tag.name}
          </span>
          <button
            type="button"
            aria-label={`Remove ${tag.name}`}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => removeTag(tag.id)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              className="size-3"
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </Badge>
      ))}

      {/* Popover trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-fit gap-1 rounded-full border-dashed px-2.5 text-xs font-normal text-muted-foreground transition-colors"
            aria-label={`Add ${category.name} tag`}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              className="size-3"
              strokeWidth={2}
              aria-hidden
            />
            Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 max-w-[var(--radix-popover-content-available-width)] p-2"
          align="start"
        >
          {/* Search input */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search or create…`}
            className="mb-2 h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label={`Search ${category.name} tags`}
            // Keep typing local while letting Escape dismiss the popover.
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
            }}
          />

          {/* Tag list */}
          <ScrollArea
            className="[&>[data-radix-scroll-area-viewport]]:max-h-48"
            role="listbox"
            aria-multiselectable="true"
            aria-label={`${category.name} tags`}
          >
            {tagsQuery.isLoading ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : filtered.length === 0 && !canCreate ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No tags found.
              </p>
            ) : (
              filtered.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30",
                      selected && "bg-muted/60",
                    )}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {/* Color dot */}
                    <span
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          tag.color ?? categoryColor ?? DEFAULT_COLOR,
                      }}
                    />
                    <span className="flex-1 truncate text-left">
                      {tag.name}
                    </span>
                    {selected && (
                      <span
                        className="ml-auto text-[10px] opacity-60"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            )}

            {/* Create new tag option */}
            {canCreate && (
              <button
                type="button"
                className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleCreate}
                disabled={createTag.isPending}
              >
                <span>+</span>
                <span>Create &ldquo;{search.trim()}&rdquo;</span>
              </button>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
