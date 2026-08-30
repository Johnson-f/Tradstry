"use client";

import { ArrowDown01Icon, Table01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $isTableSelection } from "@lexical/table";
import { mergeRegister } from "@lexical/utils";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tradstry/app-ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import { Input } from "@tradstry/app-ui/components/ui/input";
import {
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  type BaseSelection,
  COMMAND_PRIORITY_EDITOR,
  HISTORY_PUSH_TAG,
} from "lexical";
import { useEffect, useId, useRef, useState } from "react";
import {
  $applyTableAction,
  $captureTableSelection,
  $getSelectedTable,
  $hasTableHeader,
  $insertNotebookTable,
  $restoreTableSelection,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  OPEN_TABLE_PICKER_COMMAND,
  type TableAction,
} from "./table-actions";

const actions: { label: string; action: TableAction }[] = [
  { label: "Insert row above", action: "row-above" },
  { label: "Insert row below", action: "row-below" },
  { label: "Insert column left", action: "column-left" },
  { label: "Insert column right", action: "column-right" },
];

const previewCells = Array.from({ length: 6 }, (_, row) =>
  Array.from({ length: 6 }, (_, column) => ({
    id: `${row}:${column}`,
    row,
    column,
  })),
).flat();

export function TableToolbar() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [inTable, setInTable] = useState(false);
  const [hasHeader, setHasHeader] = useState(false);
  const [rows, setRows] = useState("3");
  const [columns, setColumns] = useState("3");
  const [header, setHeader] = useState(true);
  const [error, setError] = useState("");
  const lastSelection = useRef<BaseSelection | null>(null);
  const savedSelection = useRef<BaseSelection | null>(null);

  useEffect(() => {
    const update = () => {
      const selection = $getSelection();
      if (
        !$isRangeSelection(selection) &&
        !$isTableSelection(selection) &&
        !$isNodeSelection(selection)
      )
        return;
      lastSelection.current = selection.clone();
      setInTable($getSelectedTable() !== null);
      setHasHeader($hasTableHeader());
    };
    editor.getEditorState().read(update);
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(update),
      ),
      editor.registerCommand(
        OPEN_TABLE_PICKER_COMMAND,
        () => {
          if (!editor.isEditable() || $getSelectedTable()) return false;
          savedSelection.current = $captureTableSelection(
            $getSelection() ?? lastSelection.current,
          );
          setRows("3");
          setColumns("3");
          setHeader(true);
          setError("");
          setOpen(true);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [editor]);

  const applyAction = (action: TableAction) => {
    editor.update(
      () => {
        if (
          editor.isEditable() &&
          $restoreTableSelection(savedSelection.current)
        ) {
          $applyTableAction(action);
        }
      },
      { tag: HISTORY_PUSH_TAG },
    );
  };

  const rowCount = Number(rows);
  const columnCount = Number(columns);
  const valid =
    Number.isInteger(rowCount) &&
    rowCount >= 1 &&
    rowCount <= MAX_TABLE_ROWS &&
    Number.isInteger(columnCount) &&
    columnCount >= 1 &&
    columnCount <= MAX_TABLE_COLUMNS;
  const previewRows = valid ? Math.min(rowCount, 6) : 3;
  const previewColumns = valid ? Math.min(columnCount, 6) : 3;

  return (
    <>
      {!inTable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-[13px] font-medium text-muted-foreground"
          disabled={!editable}
          aria-label="Insert table"
          aria-haspopup="dialog"
          onClick={() =>
            editor.dispatchCommand(OPEN_TABLE_PICKER_COMMAND, undefined)
          }
        >
          <HugeiconsIcon icon={Table01Icon} className="size-4" />
          Table
        </Button>
      )}
      {inTable && (
        <DropdownMenu
          onOpenChange={(isOpen) => {
            if (isOpen)
              savedSelection.current = lastSelection.current?.clone() ?? null;
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!editable}
              aria-label="Table options"
              className="h-8 gap-1.5 px-2 text-[13px] font-medium"
            >
              <HugeiconsIcon icon={Table01Icon} className="size-4" />
              Table
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-48 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editor.focus();
            }}
          >
            {actions.map(({ label, action }) => (
              <DropdownMenuItem
                key={action}
                onSelect={() => applyAction(action)}
              >
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={hasHeader}
              onSelect={() => applyAction("toggle-header")}
            >
              Header row
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => applyAction("delete-row")}
            >
              Delete row
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => applyAction("delete-column")}
            >
              Delete column
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => applyAction("delete-table")}
            >
              Delete table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-sm motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            editor.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Insert table</DialogTitle>
            <DialogDescription>
              Organize your notes into rows and columns.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid || !editable) return;
              editor.update(
                () => {
                  if (
                    savedSelection.current &&
                    !$restoreTableSelection(savedSelection.current)
                  ) {
                    setError(
                      "The note changed. Close this dialog and choose where to insert your table.",
                    );
                    return;
                  }
                  if (!savedSelection.current) $getRoot().selectEnd();
                  if ($insertNotebookTable(rowCount, columnCount, header))
                    setOpen(false);
                  else
                    setError(
                      "Place your cursor outside an existing table, then try again.",
                    );
                },
                { tag: HISTORY_PUSH_TAG },
              );
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <label htmlFor={`${id}-rows`} className="space-y-1.5 font-medium">
                <span>Rows</span>
                <Input
                  id={`${id}-rows`}
                  type="number"
                  min={1}
                  max={MAX_TABLE_ROWS}
                  required
                  value={rows}
                  onChange={(event) => setRows(event.target.value)}
                  className="h-9"
                />
              </label>
              <label
                htmlFor={`${id}-columns`}
                className="space-y-1.5 font-medium"
              >
                <span>Columns</span>
                <Input
                  id={`${id}-columns`}
                  type="number"
                  min={1}
                  max={MAX_TABLE_COLUMNS}
                  required
                  value={columns}
                  onChange={(event) => setColumns(event.target.value)}
                  className="h-9"
                />
              </label>
            </div>
            <div
              aria-hidden="true"
              className="grid gap-1 rounded-lg border border-border bg-muted/20 p-3"
              style={{
                gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))`,
              }}
            >
              {previewCells
                .filter(
                  (cell) =>
                    cell.row < previewRows && cell.column < previewColumns,
                )
                .map((cell) => (
                  <div
                    key={cell.id}
                    className={`h-5 rounded-sm border border-border ${header && cell.row === 0 ? "bg-muted-foreground/20" : "bg-background"}`}
                  />
                ))}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-header`}
                checked={header}
                onCheckedChange={(checked) => setHeader(checked === true)}
              />
              <label htmlFor={`${id}-header`}>Use first row as header</label>
            </div>
            <p className="text-xs text-muted-foreground">
              Up to {MAX_TABLE_ROWS} rows and {MAX_TABLE_COLUMNS} columns. Add
              more later from Table options.
            </p>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || !editable}>
                Insert table
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
