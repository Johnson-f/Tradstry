'use client';

import type {JSX} from 'react';
import {isDOMNode} from 'lexical';
import {ReactNode, useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

function PortalImpl({
  onClose,
  children,
  title,
  closeOnClickOutside,
}: {
  children: ReactNode;
  closeOnClickOutside: boolean;
  onClose: () => void;
  title: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalRef.current !== null) {
      modalRef.current.focus();
    }
  }, []);

  useEffect(() => {
    let modalOverlayElement: HTMLElement | null = null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const clickOutsideHandler = (event: MouseEvent) => {
      const target = event.target;
      if (
        modalRef.current !== null &&
        isDOMNode(target) &&
        !modalRef.current.contains(target) &&
        closeOnClickOutside
      ) {
        onClose();
      }
    };
    const modelElement = modalRef.current;
    if (modelElement !== null) {
      modalOverlayElement = modelElement.parentElement;
      if (modalOverlayElement !== null) {
        modalOverlayElement.addEventListener('click', clickOutsideHandler);
      }
    }

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
      if (modalOverlayElement !== null) {
        modalOverlayElement?.removeEventListener('click', clickOutsideHandler);
      }
    };
  }, [closeOnClickOutside, onClose]);

  return (
    <div className="flex justify-center items-center fixed flex-col top-0 bottom-0 left-0 right-0 bg-black/60 flex-grow-0 flex-shrink z-[100]" role="dialog">
      <div className="p-5 min-h-[100px] min-w-[300px] flex flex-grow-0 bg-white flex-col relative shadow-[0_0_20px_0_#444] rounded-[10px]" tabIndex={-1} ref={modalRef}>
        <h2 className="text-gray-700 m-0 pb-2.5 border-b border-gray-300">{title}</h2>
        <button
          className="border-0 absolute right-5 rounded-[20px] justify-center items-center flex w-[30px] h-[30px] text-center cursor-pointer bg-gray-200 hover:bg-gray-300"
          aria-label="Close modal"
          type="button"
          onClick={onClose}>
          X
        </button>
        <div className="pt-5">{children}</div>
      </div>
    </div>
  );
}

export default function Modal({
  onClose,
  children,
  title,
  closeOnClickOutside = false,
}: {
  children: ReactNode;
  closeOnClickOutside?: boolean;
  onClose: () => void;
  title: string;
}): JSX.Element {
  return createPortal(
    <PortalImpl
      onClose={onClose}
      title={title}
      closeOnClickOutside={closeOnClickOutside}>
      {children}
    </PortalImpl>,
    document.body,
  );
}
