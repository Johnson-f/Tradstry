"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share, MoreHorizontal, Copy, Download, Trash2, Mic, Upload, Send, Lock, FileText, FileDown, Printer } from "lucide-react";

interface NoteHeaderProps {
  noteTitle?: string;
  createdAt?: string;
  updatedAt?: string;
  onShare?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  onSpeechToText?: () => void;
  onImport?: () => void;
  onSend?: () => void;
  onLock?: () => void;
  onMarkdown?: () => void;
  onPdfDownload?: () => void;
  onPrint?: () => void;
  isLocked?: boolean;
  isSpeechActive?: boolean;
}

export default function NoteHeader({
  noteTitle = "Untitled",
  createdAt,
  updatedAt,
  onShare,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  onSpeechToText,
  onImport,
  onSend,
  onLock,
  onMarkdown,
  onPdfDownload,
  onPrint,
  isLocked = false,
  isSpeechActive = false,
}: NoteHeaderProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
      {/* Left side - Note title and metadata */}
      <div className="flex-1">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-gray-900 truncate max-w-2xl">
            {noteTitle}
          </h1>
          
          {/* Date metadata */}
          <div className="flex items-center gap-6 text-xs text-gray-500">
            {createdAt && (
              <span>
                Created {formatDate(createdAt)} at {formatTime(createdAt)}
              </span>
            )}
            {updatedAt && (
              <span>
                Last updated {formatDate(updatedAt)} at {formatTime(updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onShare}
          className="flex items-center gap-2"
        >
          <Share className="h-4 w-4" />
          Share
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onSpeechToText}>
              <Mic className={`h-4 w-4 mr-2 ${isSpeechActive ? 'text-red-500' : ''}`} />
              Speech to Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImport}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPdfDownload}>
              <FileDown className="h-4 w-4 mr-2" />
              Download as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSend}>
              <Send className="h-4 w-4 mr-2" />
              Share Document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLock}>
              <Lock className={`h-4 w-4 mr-2 ${isLocked ? 'text-red-500' : ''}`} />
              {isLocked ? 'Unlock' : 'Lock'} Editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMarkdown}>
              <FileText className="h-4 w-4 mr-2" />
              Toggle Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
