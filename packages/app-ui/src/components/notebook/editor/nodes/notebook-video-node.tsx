"use client";

import { Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  NotebookVideoNode as NotebookVideoSchema,
  type SerializedNotebookVideoNode,
} from "@tradstry/notebook-core";
import { $getNodeByKey, type LexicalNode, type NodeKey } from "lexical";
import type { JSX } from "react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  cancelPendingMedia,
  getMediaStatus,
  getMediaUrl,
  releaseMedia,
} from "../media-registry";
import { useNotebookMediaActions } from "./notebook-image-node";

export type { SerializedNotebookVideoNode };

function NotebookVideoComponent({
  nodeKey,
  hash,
}: {
  nodeKey: NodeKey;
  hash: string;
}) {
  const [editor] = useLexicalComposerContext();
  const { urlFor, onDeleteImage } = useNotebookMediaActions();
  // A local blob: URL mid-upload takes precedence over the (possibly not-yet-
  // resolvable) server URL.
  const src = getMediaUrl(nodeKey) ?? urlFor?.(hash);
  const isTemp = getMediaStatus(nodeKey) === "pending";
  const isPending = !src;

  const handleDelete = async () => {
    if (getMediaStatus(nodeKey) === "pending") cancelPendingMedia(nodeKey);
    else {
      await onDeleteImage?.(hash);
      releaseMedia(nodeKey);
    }
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
  };

  return (
    <div className="group relative my-2 inline-block max-w-full">
      {/** biome-ignore lint/a11y/useMediaCaption: user-pasted clips have no captions */}
      <video
        src={src}
        controls
        preload="metadata"
        className="max-h-[32rem] max-w-full rounded-lg"
      />
      {isTemp || isPending ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/20">
          <div className="size-7 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={isTemp ? "Cancel upload" : "Delete video"}
        onClick={handleDelete}
        className={`absolute top-2 right-2 z-20 bg-black/50 text-white transition-opacity hover:bg-black/70 hover:text-white ${
          isTemp ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <HugeiconsIcon
          icon={isTemp ? Cancel01Icon : Delete02Icon}
          strokeWidth={2}
        />
      </Button>
    </div>
  );
}

/** Serialization lives in @tradstry/notebook-core; only rendering is here. */
export class NotebookVideoNode extends NotebookVideoSchema<JSX.Element> {
  static getType(): string {
    return NotebookVideoSchema.getType();
  }

  static clone(node: NotebookVideoNode): NotebookVideoNode {
    return new NotebookVideoNode(node.__hash, node.__altText, node.__key);
  }

  static importJSON(
    serializedNode: SerializedNotebookVideoNode,
  ): NotebookVideoNode {
    return $createNotebookVideoNode({
      hash: serializedNode.hash,
      altText: serializedNode.altText,
    });
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  decorate(): JSX.Element {
    return (
      <NotebookVideoComponent nodeKey={this.getKey()} hash={this.__hash} />
    );
  }
}

export function $createNotebookVideoNode({
  hash,
  altText = "",
}: {
  hash: string;
  altText?: string;
}): NotebookVideoNode {
  return new NotebookVideoNode(hash, altText);
}

export function $isNotebookVideoNode(
  node: LexicalNode | null | undefined,
): node is NotebookVideoNode {
  return node instanceof NotebookVideoNode;
}
