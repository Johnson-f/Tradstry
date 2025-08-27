"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import {
  $createImageNode,
  $isImageNode,
  ImageNode,
} from "../../nodes/ImageNode";
import {
  useImageUpload,
  useImageDelete,
} from "../../../../../lib/hooks/use-images";

// Store copied image data
let copiedImageData: {
  src: string;
  altText: string;
  width?: number | "inherit";
  height?: number | "inherit";
  maxWidth?: number;
  imageId?: string;
} | null = null;

export default function ImageCopyPastePlugin({
  noteId,
}: {
  noteId?: string;
}): null {
  const [editor] = useLexicalComposerContext();
  const { uploadImage } = useImageUpload();
  const { deleteImage } = useImageDelete();

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

                // On cut, just remove the node from the editor.
                // The image remains in the database until all references are deleted.
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
          const clipboardData =
            event instanceof ClipboardEvent ? event.clipboardData : null;

          if (clipboardData) {
            // Check for image files in clipboard
            const items = Array.from(clipboardData.items);
            const imageItem = items.find((item) =>
              item.type.startsWith("image/"),
            );

            if (imageItem) {
              const file = imageItem.getAsFile();
              if (file) {
                // Upload the pasted image to database
                uploadPastedImage(file, editor, noteId, uploadImage);

                event.preventDefault();
                return true;
              }
            }
          }

          // Check if we have copied image data to paste
          if (copiedImageData?.src) {
            try {
              const response = await fetch(copiedImageData.src);
              const blob = await response.blob();
              const filename = `pasted-image-${Date.now()}.${
                blob.type.split("/")[1] || "png"
              }`;
              const file = new File([blob], filename, { type: blob.type });

              uploadPastedImage(file, editor, noteId, uploadImage);
            } catch (error) {
              console.error("Failed to re-upload copied image:", error);
              // Fallback to inserting a reference
              editor.update(() => {
                const imageNode = $createImageNode({
                  src: copiedImageData!.src,
                  altText: copiedImageData!.altText,
                  width:
                    typeof copiedImageData!.width === "number"
                      ? copiedImageData!.width
                      : undefined,
                  height:
                    typeof copiedImageData!.height === "number"
                      ? copiedImageData!.height
                      : undefined,
                  maxWidth: copiedImageData!.maxWidth || 500,
                  imageId: copiedImageData!.imageId,
                });
                const selection = $getSelection();
                if (selection) {
                  selection.insertNodes([imageNode]);
                }
              });
            }

            event?.preventDefault();
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      // Handle delete key command
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event) => {
          return handleImageDeletion(editor, deleteImage);
        },
        COMMAND_PRIORITY_HIGH,
      ),

      // Handle backspace key command
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          return handleImageDeletion(editor, deleteImage);
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, uploadImage, deleteImage, noteId]);

  return null;
}

// Helper function to handle image deletion from database
function handleImageDeletion(
  editor: any,
  deleteImage: (imageId: string, deleteFromStorage?: boolean) => Promise<any>,
): boolean {
  let handled = false;

  editor.update(() => {
    const selection = $getSelection();

    if ($isNodeSelection(selection)) {
      const nodes = selection.getNodes();
      const imageNode = nodes.find($isImageNode);

      if (imageNode) {
        // Delete from database if it has an imageId
        const imageId = imageNode.getImageId();
        if (imageId) {
          deleteImageFromDatabase(imageId, deleteImage);
        }

        // Remove the node from editor
        imageNode.remove();
        handled = true;
      }
    }
  });

  return handled;
}

// Helper function to delete image from database
async function deleteImageFromDatabase(
  imageId: string,
  deleteImage: (imageId: string, deleteFromStorage?: boolean) => Promise<any>,
) {
  try {
    await deleteImage(imageId, true); // true = delete from storage bucket as well
    console.log("Image deleted from database:", imageId);
  } catch (error) {
    console.error("Failed to delete image from database:", error);
  }
}

// Helper function to upload pasted image to database
async function uploadPastedImage(
  file: File,
  editor: any,
  noteId: string | undefined,
  uploadImage: (params: any) => Promise<any>,
) {
  try {
    // Create a temporary data URL for immediate display
    const tempUrl = URL.createObjectURL(file);
    let imageNodeKey: string | null = null;

    // Insert image immediately with temporary URL and store its key
    editor.update(() => {
      const imageNode = $createImageNode({
        altText: "Pasted image",
        height: undefined,
        maxWidth: 500,
        src: tempUrl,
        width: undefined,
      });

      const selection = $getSelection();
      if (selection) {
        selection.insertNodes([imageNode]);
        imageNodeKey = imageNode.getKey();
      }
    });

    // Upload to database in the background
    const uploadedImage = await uploadImage({
      file: file,
      note_id: noteId,
      alt_text: "Pasted image",
    });

    // Update the image node with the database image ID and proper URL using the stored key
    if (imageNodeKey) {
      editor.update(() => {
        const imageNode = $getNodeByKey(imageNodeKey);

        if ($isImageNode(imageNode) && imageNode.getSrc() === tempUrl) {
          // Create a new image node with the uploaded image data
          const updatedImageNode = $createImageNode({
            altText: "Pasted image",
            height: imageNode.__height,
            maxWidth: imageNode.__maxWidth,
            src: `/api/images/${uploadedImage.id}`,
            width: imageNode.__width,
            imageId: uploadedImage.id,
          });

          imageNode.replace(updatedImageNode);
        }
      });
    }

    // Clean up the temporary URL
    URL.revokeObjectURL(tempUrl);

    console.log("Pasted image uploaded successfully:", uploadedImage.id);
  } catch (error) {
    console.error("Failed to upload pasted image:", error);
    // Image will remain with temporary URL if upload fails
  }
}

// Helper function to copy image to system clipboard
async function copyImageToClipboard(imageData: { src: string }) {
  try {
    const src = imageData.src;

    // If it's a data URL, we can copy it directly
    if (src.startsWith("data:")) {
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
        const response = await fetch(src, { mode: "cors" });
        const blob = await response.blob();

        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
        }
      } catch (error) {
        console.warn("Could not copy image to system clipboard:", error);
        // Fallback: copy image URL as text
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(src);
        }
      }
    }
  } catch (error) {
    console.warn("Failed to copy image to clipboard:", error);
  }
}
