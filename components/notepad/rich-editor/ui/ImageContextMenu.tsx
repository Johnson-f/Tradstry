'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Trash2, Download, Loader2 } from 'lucide-react';

interface ImageContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDownload: () => void;
  isDeleting?: boolean;
}

export default function ImageContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onDelete,
  onDownload,
  isDeleting = false,
}: ImageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let adjustedX = x;
      let adjustedY = y;
      
      // Adjust horizontal position
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      
      // Adjust vertical position
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }
      
      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleCopy = useCallback(() => {
    onCopy();
    onClose();
  }, [onCopy, onClose]);

  const handleDelete = useCallback(() => {
    onDelete();
    onClose();
  }, [onDelete, onClose]);

  const handleDownload = useCallback(() => {
    onDownload();
    onClose();
  }, [onDownload, onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onClick={handleCopy}
      >
        <Copy className="h-4 w-4" />
        Copy Image
      </button>
      
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onClick={handleDownload}
      >
        <Download className="h-4 w-4" />
        Download Image
      </button>
      
      <hr className="my-1 border-gray-200" />
      
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {isDeleting ? 'Deleting...' : 'Delete Image'}
      </button>
    </div>
  );
}
