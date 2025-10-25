// Push Request from client to server
export interface PushRequest {
  clientGroupID: string;
  mutations: Mutation[];
}

export interface Mutation {
  id: number;
  clientID: string;
  name: string;
  args: unknown;
  timestamp: number;
}

// Pull Request from client to server
export interface PullRequest {
  clientGroupID: string;
  cookie: number | null;
}

// Pull Response from server to client
export interface PullResponse {
  cookie: number;
  lastMutationIDChanges: Record<string, number>;
  patch: PatchOperation[];
}

export interface PatchOperation {
  op: 'put' | 'del' | 'clear';
  key: string;
  value?: unknown;
}

// Client state tracking
export interface ClientState {
  clientGroupID: string;
  clientID: string;
  lastMutationID: number;
  lastModifiedVersion: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// Space version tracking
export interface SpaceVersion {
  id: number;
  version: number;
}

// Data transformation types
export interface StockKV {
  id: number;
  userId: string;
  symbol: string;
  tradeType: string;
  orderType: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  commissions: number;
  numberShares: number;
  takeProfit?: number;
  entryDate: string;
  exitDate?: string;
  createdAt: string;
  updatedAt: string;
  version: number; // For LWW conflict resolution
}

export interface OptionKV {
  id: number;
  userId: string;
  symbol: string;
  strategyType: string;
  tradeDirection: string;
  numberOfContracts: number;
  optionType: string;
  strikePrice: number;
  expirationDate: string;
  entryPrice: number;
  exitPrice?: number;
  totalPremium: number;
  commissions: number;
  impliedVolatility: number;
  entryDate: string;
  exitDate?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number; // For LWW conflict resolution
}

export interface NoteKV {
  id: string;
  userId: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  version: number; // For LWW conflict resolution
}

export interface PlaybookKV {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  version: number; // For LWW conflict resolution
}
