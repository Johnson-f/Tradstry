// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Safe hostname check for Next.js SSR compatibility
const getHostName = (): string => {
  if (!isBrowser) return '';
  return window.location.hostname;
};

export const isDevPlayground: boolean = (() => {
  if (!isBrowser) {
    // During SSR, check only NODE_ENV
    return process.env.NODE_ENV === 'development';
  }
  
  const hostName = getHostName();
  return (
    hostName === 'localhost' || 
    hostName === '127.0.0.1' || 
    hostName.startsWith('192.168.') || // local network
    hostName.endsWith('.local') ||     // Local development domains
    process.env.NODE_ENV === 'development'
  );
})();

export const DEFAULT_SETTINGS = {
  disableBeforeInput: false,
  emptyEditor: isDevPlayground,
  hasLinkAttributes: false,
  isAutocomplete: false,
  isCharLimit: false,
  isCharLimitUtf8: false,
  isCodeHighlighted: true,
  isCodeShiki: false,
  isCollab: false,
  isMaxLength: false,
  isRichText: true,
  listStrictIndent: false,
  measureTypingPerf: false,
  selectionAlwaysOnDisplay: false,
  shouldAllowHighlightingWithBrackets: false,
  shouldPreserveNewLinesInMarkdown: false,
  shouldUseLexicalContextMenu: false,
  showNestedEditorTreeView: false,
  showTableOfContents: false,
  tableCellBackgroundColor: true,
  tableCellMerge: true,
  tableHorizontalScroll: true,
} as const;

// These are mutated in setupEnv
export const INITIAL_SETTINGS: Record<SettingName, boolean> = {
  ...DEFAULT_SETTINGS,
};

export type SettingName = keyof typeof DEFAULT_SETTINGS;

export type Settings = typeof INITIAL_SETTINGS;
