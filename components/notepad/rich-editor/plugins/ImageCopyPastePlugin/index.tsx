'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isNodeSelection,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import { useEffect } from 'react';
import { $createImageNode, $isImageNode, ImageNode } from '../../nodes/ImageNode';

// Store copied image data
let copiedImageData: {
  src: string;
  altText: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
  maxWidth?: number;
  imageId?: string;
} | null = null;

export default function ImageCopyPastePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      // Handle copy command
      editor.registerCommand(
        COPY_COMMAND,
        (event) => {
          let handled = false;
          let imageDataToStore: any = null;
          
          editor.update(() => {
            const selection = $getSelection();
            
            if ($isNodeSelection(selection)) {
              const nodes = selection.getNodes();
              const imageNode = nodes.find($isImageNode);
              
              if (imageNode) {
                // Store image data for pasting
                imageDataToStore = {
                  src: imageNode.getSrc(),
                  altText: imageNode.getAltText(),
                  width: imageNode.__width,
                  height: imageNode.__height,
                  maxWidth: imageNode.__maxWidth,
                  imageId: imageNode.getImageId(),
                };
                
                handled = true;
              }
            }
          });
          
          if (handled && imageDataToStore) {
            copiedImageData = imageDataToStore;
            // Copy to system clipboard after the editor update
            copyImageToClipboard(imageDataToStore);
            event?.preventDefault();
            return true;
          }
          
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      // Handle cut command
      editor.registerCommand(
        CUT_COMMAND,
        (event) => {
          let handled = false;
          let imageDataToStore: any = null;
          
          editor.update(() => {
            const selection = $getSelection();
            
            if ($isNodeSelection(selection)) {
              const nodes = selection.getNodes();
              const imageNode = nodes.find($isImageNode);
              
              if (imageNode) {
                // Store image data for pasting
                imageDataToStore = {
                  src: imageNode.getSrc(),
                  altText: imageNode.getAltText(),
                  width: imageNode.__width,
                  height: imageNode.__height,
                  maxWidth: imageNode.__maxWidth,
                  imageId: imageNode.getImageId(),
                };
                
                // Remove the node
                imageNode.remove();
                
                handled = true;
              }
            }
          });
          
          if (handled && imageDataToStore) {
            copiedImageData = imageDataToStore;
            // Copy to system clipboard after the editor update
            copyImageToClipboard(imageDataToStore);
            event?.preventDefault();
            return true;
          }
          
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      // Handle paste command
      editor.registerCommand(
        PASTE_COMMAND,
        async (event) => {
          const clipboardData = event instanceof ClipboardEvent ? event.clipboardData : null;
          
          if (clipboardData) {
            // Check for image files in clipboard
            const items = Array.from(clipboardData.items);
            const imageItem = items.find(item => item.type.startsWith('image/'));
            
            if (imageItem) {
              const file = imageItem.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                  const src = reader.result as string;
                  editor.update(() => {
                    const imageNode = $createImageNode({
                      altText: 'Pasted image',
                      height: undefined,
                      maxWidth: 500,
                      src: src,
                      width: undefined,
                    });
                    
                    const selection = $getSelection();
                    if (selection) {
                      selection.insertNodes([imageNode]);
                    }
                  });
                };
                reader.readAsDataURL(file);
                
                event.preventDefault();
                return true;
              }
            }
          }
          
          // Check if we have copied image data to paste
          if (copiedImageData) {
            editor.update(() => {
              const imageNode = $createImageNode({
                src: copiedImageData!.src,
                altText: copiedImageData!.altText,
                width: typeof copiedImageData!.width === 'number' ? copiedImageData!.width : undefined,
                height: typeof copiedImageData!.height === 'number' ? copiedImageData!.height : undefined,
                maxWidth: copiedImageData!.maxWidth || 500,
                imageId: copiedImageData!.imageId,
              });
              
              const selection = $getSelection();
              if (selection) {
                selection.insertNodes([imageNode]);
              }
            });
            
            event?.preventDefault();
            return true;
          }
          
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
}

// Helper function to copy image to system clipboard
async function copyImageToClipboard(imageData: { src: string }) {
  try {
    const src = imageData.src;
    
    // If it's a data URL, we can copy it directly
    if (src.startsWith('data:')) {
      const response = await fetch(src);
      const blob = await response.blob();
      
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
      }
    } else {
      // For external URLs, we need to fetch and convert
      try {
        const response = await fetch(src, { mode: 'cors' });
        const blob = await response.blob();
        
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
        }
      } catch (error) {
        console.warn('Could not copy image to system clipboard:', error);
        // Fallback: copy image URL as text
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(src);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to copy image to clipboard:', error);
  }
}