"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  isImage,
  isVideo,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  probeDimensions,
} from "@tradstry/notebook-core/media";
import { $getNodeByKey, $insertNodes } from "lexical";
import { useEffect, useRef } from "react";
import type { NotebookImage } from "@tradstry/app-ui/lib/types/notebook";
import { newUuidV7 } from "@tradstry/app-ui/lib/uuid";
import { hashMediaFile } from "../media-hash";
import {
  confirmMedia,
  registerPendingMedia,
  releaseMedia,
} from "../media-registry";
import {
  $createNotebookImageNode,
  $isNotebookImageNode,
} from "../nodes/notebook-image-node";
import {
  $createNotebookVideoNode,
  $isNotebookVideoNode,
} from "../nodes/notebook-video-node";

export function PasteImagePlugin({
  onUploadMedia,
}: {
  onUploadMedia?: (
    file: File,
    hash: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => Promise<NotebookImage>;
}) {
  const [editor] = useLexicalComposerContext();
  const uploadMediaRef = useRef(onUploadMedia);
  uploadMediaRef.current = onUploadMedia;

  useEffect(() => {
    let disposed = false;
    const hashingControllers = new Set<AbortController>();
    const unregister = editor.registerRootListener((rootElement, previousRootElement) => {
      if (previousRootElement) {
        previousRootElement.onpaste = null;
      }

      if (!rootElement) {
        return;
      }

      rootElement.onpaste = (event) => {
        const uploadMedia = uploadMediaRef.current;
        if (!uploadMedia) return;
        const mediaFiles = new Map<string, File>();
        const isMedia = (type: string) => isImage(type) || isVideo(type);
        const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
        const clipboardItems = Array.from(
          event.clipboardData?.items ?? [],
        ).filter((item) => item.kind === "file" && isMedia(item.type));

        for (const file of clipboardFiles) {
          if (isMedia(file.type)) {
            mediaFiles.set(`${file.name}:${file.size}:${file.type}`, file);
          }
        }

        for (const item of clipboardItems) {
          const file = item.getAsFile();
          if (!file || !isMedia(file.type)) continue;
          mediaFiles.set(`${file.name}:${file.size}:${file.type}`, file);
        }

        const files = Array.from(mediaFiles.values());
        if (files.length === 0) return;

        event.preventDefault();

        void Promise.all(
          files.map(async (file) => {
            const video = isVideo(file.type);
            const cap = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
            if (file.size > cap) {
              console.warn(
                `Skipping pasted ${video ? "video" : "image"} "${file.name}": ` +
                  `${file.size} bytes exceeds the ${cap} byte cap`,
              );
              return;
            }

            const controller = new AbortController();
            hashingControllers.add(controller);
            let hash: string;
            try {
              hash = await hashMediaFile(file, controller.signal);
            } catch (error) {
              if (!controller.signal.aborted) {
                console.error("Failed to hash pasted notebook media", error);
              }
              return;
            } finally {
              hashingControllers.delete(controller);
            }
            if (disposed) return;
            const idempotencyKey = newUuidV7();

            let nodeKey: string | null = null;
            editor.update(() => {
              const node = video
                ? $createNotebookVideoNode({ hash, altText: file.name })
                : $createNotebookImageNode({
                    hash,
                    altText: file.name,
                    width: 0,
                    height: 0,
                  });
              nodeKey = node.getKey();
              $insertNodes([node]);
            });
            if (!nodeKey) return;
            registerPendingMedia(nodeKey, URL.createObjectURL(file), controller);

            try {
              if (!video) {
                const dims = await probeDimensions(file);
                editor.update(() => {
                  const liveNode = nodeKey ? $getNodeByKey(nodeKey) : null;
                  if (!liveNode || !$isNotebookImageNode(liveNode)) return;
                  const writable = liveNode.getWritable();
                  writable.__width = dims.width;
                  writable.__height = dims.height;
                });
              }

              const image = await uploadMedia(
                file,
                hash,
                idempotencyKey,
                controller.signal,
              );
              confirmMedia(nodeKey, image.secureUrl);
            } catch (error) {
              if (nodeKey) releaseMedia(nodeKey);
              editor.update(() => {
                const liveNode = nodeKey ? $getNodeByKey(nodeKey) : null;
                if (!liveNode) return;
                if (
                  $isNotebookVideoNode(liveNode) ||
                  $isNotebookImageNode(liveNode)
                ) {
                  liveNode.remove();
                }
              });

              console.error("Failed to upload pasted notebook media", error);
            }
          }),
        );
      };
    });
    return () => {
      disposed = true;
      for (const controller of hashingControllers) controller.abort();
      unregister();
    };
  }, [editor]);

  return null;
}
