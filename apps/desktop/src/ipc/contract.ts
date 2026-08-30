export type DesktopEvent<T = unknown> = {
  event: string;
  payload: T;
};

export type Unlisten = () => void;
export type DesktopTheme = "light" | "dark" | "system";
export type DesktopStoreMediaInput = {
  noteId: string;
  accountId: string;
  hash: string;
  mime: string;
  mediaType: string;
  width: number;
  height: number;
  durationSeconds: number;
  originalFilename: string;
  thumb: Uint8Array;
};
export type DesktopMediaResolved = {
  state: "local" | "remote" | "missing";
  fullPath: string | null;
  thumbPath: string | null;
};

export interface DesktopBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, listener: (event: DesktopEvent<T>) => void): Unlisten;
  mediaUrl(path: string): string;
  storeMedia(input: DesktopStoreMediaInput, file: File): Promise<DesktopMediaResolved | null>;
  openExternal(url: string): Promise<void>;
  setTheme(theme: DesktopTheme): Promise<void>;
  subscribe<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    handlers: {
      onMessage: (data: T) => void;
      onError?: (error: Error) => void;
      onComplete?: () => void;
    },
  ): Unlisten;
}

declare global {
  interface Window {
    tradstry: DesktopBridge;
  }
}
