"use client";
import { defaultEditorContent } from "../../lib/content";
import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  type EditorInstance,
  EditorRoot,
  ImageResizer,
  type JSONContent,
  handleCommandNavigation,
  handleImageDrop,
  handleImagePaste,
} from "novel";
import { useEffect, useState, useMemo } from "react";
import { useDebouncedCallback } from "use-debounce";
import { defaultExtensions } from "./extensions";
import { ColorSelector } from "./selectors/color-selector";
import { LinkSelector } from "./selectors/link-selector";
import { MathSelector } from "./selectors/math-selector";
import { NodeSelector } from "./selectors/node-selector";
import { Separator } from "./ui/separator";

import GenerativeMenuSwitch from "./generative/generative-menu-switch";
import { createUploadFn } from "./image-upload";
import { TextButtons } from "./selectors/text-buttons";
import { slashCommand, suggestionItems } from "./slash-command";

const hljs = require("highlight.js");

const extensions = [...defaultExtensions, slashCommand];

interface TailwindAdvancedEditorProps {
  initialContent?: JSONContent | null;
  initialHtmlContent?: string;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void;
  tradeNoteId?: string;
}

const TailwindAdvancedEditor = ({ 
  initialContent: propInitialContent, 
  initialHtmlContent,
  onContentChange, 
  onSave,
  tradeNoteId
}: TailwindAdvancedEditorProps = {}) => {
  const [initialContent, setInitialContent] = useState<null | JSONContent>(null);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [charsCount, setCharsCount] = useState();
  
  // Create upload function with trade note ID
  const uploadFn = useMemo(() => createUploadFn(tradeNoteId), [tradeNoteId]);

  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openAI, setOpenAI] = useState(false);

  //Apply Codeblock Highlighting on the HTML from editor.getHTML()
  const highlightCodeblocks = (content: string) => {
    const doc = new DOMParser().parseFromString(content, "text/html");
    doc.querySelectorAll("pre code").forEach((el) => {
      // @ts-ignore
      // https://highlightjs.readthedocs.io/en/latest/api.html?highlight=highlightElement#highlightelement
      hljs.highlightElement(el);
    });
    return new XMLSerializer().serializeToString(doc);
  };

  const debouncedUpdates = useDebouncedCallback(async (editor: EditorInstance) => {
    const json = editor.getJSON();
    const htmlContent = editor.getHTML();
    setCharsCount(editor.storage.characterCount.words());
    window.localStorage.setItem("html-content", highlightCodeblocks(htmlContent));
    window.localStorage.setItem("novel-content", JSON.stringify(json));
    // Markdown functionality removed - using HTML content instead
    window.localStorage.setItem("markdown", htmlContent);
    setSaveStatus("Saved");
    
    // Call the content change callback if provided
    if (onContentChange) {
      onContentChange(htmlContent);
    }
    
    // Call the save callback if provided
    if (onSave) {
      onSave(htmlContent);
    }
  }, 500);

  useEffect(() => {
    if (propInitialContent) {
      setInitialContent(propInitialContent);
    } else if (initialHtmlContent !== undefined) {
      // Convert HTML to JSONContent or create empty content
      try {
        if (initialHtmlContent === '' || initialHtmlContent === null) {
          // Create completely empty content for new notes
          setInitialContent({
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: []
            }]
          });
        } else {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = initialHtmlContent;
          const textContent = tempDiv.textContent || '';
          
          // Create a simple JSONContent structure
          const jsonContent: JSONContent = {
            type: 'doc',
            content: textContent ? [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: textContent }]
              }
            ] : [{
              type: 'paragraph',
              content: []
            }]
          };
          setInitialContent(jsonContent);
        }
      } catch (error) {
        console.error('Error converting HTML to JSONContent:', error);
        // For notes modal, start with empty content on error
        setInitialContent({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: []
          }]
        });
      }
    } else {
      const content = window.localStorage.getItem("novel-content");
      if (content) setInitialContent(JSON.parse(content));
      else setInitialContent(defaultEditorContent);
    }
  }, [propInitialContent, initialHtmlContent]);

  // Force re-initialization when initialHtmlContent changes
  useEffect(() => {
    if (initialHtmlContent !== undefined) {
      if (initialHtmlContent === '' || initialHtmlContent === null) {
        setInitialContent({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: []
          }]
        });
      } else {
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = initialHtmlContent;
          const textContent = tempDiv.textContent || '';
          
          setInitialContent({
            type: 'doc',
            content: textContent ? [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: textContent }]
              }
            ] : [{
              type: 'paragraph',
              content: []
            }]
          });
        } catch (error) {
          console.error('Error converting HTML to JSONContent:', error);
          setInitialContent({
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: []
            }]
          });
        }
      }
    }
  }, [initialHtmlContent]);

  if (!initialContent) return null;

  return (
    <div className="relative w-full min-h-[500px] flex flex-col">
      <div className="flex absolute right-5 top-5 z-10 mb-5 gap-2">
        <div className="rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground">{saveStatus}</div>
        <div className={charsCount ? "rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground" : "hidden"}>
          {charsCount} Words
        </div>
      </div>
      <EditorRoot>
        <EditorContent
          initialContent={initialContent}
          extensions={extensions}
          className="relative min-h-[500px] w-full border-muted bg-background rounded-lg border shadow-lg"
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
            handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class:
                "prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full tr-notes-editor",
            },
          }}
          onUpdate={({ editor }) => {
            debouncedUpdates(editor);
            setSaveStatus("Unsaved");
          }}
          slotAfter={<ImageResizer />}
        >
          <style>{`
            /* Ensure images are fully visible during and after upload */
            .tr-notes-editor img { opacity: 1 !important; filter: none !important; }
            .tr-notes-editor figure img { opacity: 1 !important; filter: none !important; }
          `}</style>
          <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="px-2 text-muted-foreground">No results</EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={(val) => item.command?.(val)}
                  className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent"
                  key={item.title}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          <GenerativeMenuSwitch open={openAI} onOpenChange={setOpenAI}>
            <Separator orientation="vertical" />
            <NodeSelector open={openNode} onOpenChange={setOpenNode} />
            <Separator orientation="vertical" />

            <LinkSelector open={openLink} onOpenChange={setOpenLink} />
            <Separator orientation="vertical" />
            <MathSelector />
            <Separator orientation="vertical" />
            <TextButtons />
            <Separator orientation="vertical" />
            <ColorSelector open={openColor} onOpenChange={setOpenColor} />
          </GenerativeMenuSwitch>
        </EditorContent>
      </EditorRoot>
    </div>
  );
};

export default TailwindAdvancedEditor;
