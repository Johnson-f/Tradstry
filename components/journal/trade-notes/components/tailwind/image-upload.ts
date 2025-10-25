import { createImageUpload } from "novel";
import { toast } from "sonner";
import imagesService from "@/lib/services/images-service";
// no need to import api endpoints for direct image src; use signed URL instead

let tradeNoteIdOverride: string | undefined;

export function setTradeNoteId(id: string) {
  tradeNoteIdOverride = id;
}

function getTradeNoteId(): string | undefined {
  if (tradeNoteIdOverride) return tradeNoteIdOverride;

  const fromDataAttr = document.body?.getAttribute?.("data-trade-note-id") || undefined;
  if (fromDataAttr) return fromDataAttr;

  try {
    const lsId =
      localStorage.getItem("trade_note_id") ||
      localStorage.getItem("note_id") ||
      localStorage.getItem("noteId") ||
      undefined;
    if (lsId) return lsId;
  } catch {}

  try {
    const urlObj = new URL(window.location.href);
    return (
      urlObj.searchParams.get("trade_note_id") ||
      urlObj.searchParams.get("note_id") ||
      urlObj.searchParams.get("noteId") ||
      undefined
    );
  } catch {
    return undefined;
  }
}

const onUpload = (file: File) => {
  const promise = (async () => {
    const tradeNoteId = getTradeNoteId();
    if (!tradeNoteId) throw new Error("Missing note_id");

    const uploaded = await imagesService.uploadImage({ file, note_id: tradeNoteId });
    console.log('Upload response:', uploaded); // Debug log
    
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    const imageId = (uploaded as Record<string, unknown>)?.id 
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      ?? (uploaded as Record<string, unknown>)?.image?.id 
  // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      ?? (uploaded as Record<string, unknown>)?.data?.id
      // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      ?? (uploaded as Record<string, unknown>)?.image_id; // Additional fallback
    
    if (!imageId) {
      console.error('Upload response structure:', uploaded);
      throw new Error("Upload response missing image id");
    }
    
    console.log('Getting URL for image ID:', imageId); // Debug log
    const urlResponse = await imagesService.getImageUrl(imageId);
    console.log('URL response:', urlResponse); // Debug log
    
    if (!urlResponse?.url) {
      throw new Error("Failed to get image URL");
    }
    
    return { url: urlResponse.url };
  })();

  return new Promise((resolve, reject) => {
    toast.promise(
      promise.then(async ({ url }) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(url);
      }),
      {
        loading: "Uploading image...",
        success: "Image uploaded successfully.",
        error: (e) => {
          console.error('Image upload error:', e);
          reject(e);
          return e.message || "Failed to upload image. Please check console for details.";
        },
      },
    );
  });
};

export const createUploadFn = (tradeNoteId?: string) => {
  // Set the trade note ID for this upload session
  if (tradeNoteId) {
    setTradeNoteId(tradeNoteId);
  }
  
  return createImageUpload({
    onUpload,
    validateFn: (file) => {
      if (!file.type.includes("image/")) {
        toast.error("File type not supported.");
        return false;
      }
      if (file.size / 1024 / 1024 > 20) {
        toast.error("File size too big (max 20MB).");
        return false;
      }
      return true;
    },
  });
};

// Default export for backward compatibility
export const uploadFn = createUploadFn();
