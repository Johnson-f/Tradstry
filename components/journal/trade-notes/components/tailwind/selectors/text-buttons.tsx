import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BoldIcon, CodeIcon, ItalicIcon, StrikethroughIcon, UnderlineIcon } from "lucide-react";
import { EditorBubbleItem, useEditor } from "novel";
import type { SelectorItem } from "./node-selector";

export const TextButtons = () => {
  const { editor } = useEditor();
  if (!editor) return null;
  const items: SelectorItem[] = [
    {
      name: "bold",
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      isActive: (editor) => editor.isActive("bold"),
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      command: (editor) => editor.chain().focus().toggleBold().run(),
      icon: BoldIcon,
    },
    {
      name: "italic",
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      isActive: (editor) => editor.isActive("italic"),
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      command: (editor) => editor.chain().focus().toggleItalic().run(),
      icon: ItalicIcon,
    },
    {
      name: "underline",
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      isActive: (editor) => editor.isActive("underline"),
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      command: (editor) => editor.chain().focus().toggleUnderline().run(),
      icon: UnderlineIcon,
    },
    {
      name: "strike",
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      isActive: (editor) => editor.isActive("strike"),
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      command: (editor) => editor.chain().focus().toggleStrike().run(),
      icon: StrikethroughIcon,
    },
    {
      name: "code",
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      isActive: (editor) => editor.isActive("code"),
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      command: (editor) => editor.chain().focus().toggleCode().run(),
      icon: CodeIcon,
    },
  ];
  return (
    <div className="flex">
      {items.map((item) => (
        <EditorBubbleItem
          key={item.name}
          onSelect={(editor) => {
            item.command(editor);
          }}
        >
          <Button size="sm" className="rounded-none" variant="ghost" type="button">
            <item.icon
              className={cn("h-4 w-4", {
                "text-blue-500": item.isActive(editor),
              })}
            />
          </Button>
        </EditorBubbleItem>
      ))}
    </div>
  );
};
