import { apiClient } from "./api-client";

export interface TradeNoteType {
  STOCK: "stock";
  OPTION: "option";
}

export enum TradePhase {
  PRE_ENTRY = "pre_entry",
  ENTRY = "entry",
  MANAGEMENT = "management",
  EXIT = "exit",
  POST_ANALYSIS = "post_analysis",
}

export interface TradeNoteBase {
  trade_id: number;
  trade_type: "stock" | "option";
  title: string;
  content: string;
  tags?: string[];
  rating?: number;
  phase?: TradePhase;
  image_id?: number;
}

export interface TradeNoteCreate extends TradeNoteBase {}

export interface TradeNoteUpdate {
  title?: string;
  content?: string;
  tags?: string[];
  rating?: number;
  phase?: TradePhase;
  image_id?: number;
}

export interface TradeNoteInDB extends TradeNoteBase {
  id: number;
  user_id: string;
  created_at: string;
  updated_at: string;
  trade_symbol?: string; // Symbol of the associated trade
}

export interface TradeNoteFilters {
  note_id?: number;
  trade_id?: number;
  trade_type?: "stock" | "option";
  tags?: string[];
  phase?: TradePhase;
  rating?: number;
}

export interface TradeNoteResponse {
  success: boolean;
  action?: "inserted" | "updated";
  note_id?: number;
  message?: string;
}

class TradeNotesService {
  private readonly baseUrl = "/trade-notes";

  async createTradeNote(note: TradeNoteCreate): Promise<TradeNoteResponse> {
    const response = await apiClient.post<TradeNoteResponse>(
      this.baseUrl,
      note,
    );
    return response;
  }

  async getTradeNotes(filters?: TradeNoteFilters): Promise<TradeNoteInDB[]> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v.toString()));
          } else {
            params.append(key, value.toString());
          }
        }
      });
    }

    const response = await apiClient.get<TradeNoteInDB[]>(
      `${this.baseUrl}${params.toString() ? `?${params.toString()}` : ""}`,
    );
    return response;
  }

  async updateTradeNote(
    noteId: number,
    note: TradeNoteUpdate,
  ): Promise<TradeNoteResponse> {
    const response = await apiClient.put<TradeNoteResponse>(
      `${this.baseUrl}/${noteId}`,
      note,
    );
    return response;
  }

  async deleteTradeNote(noteId: number): Promise<TradeNoteResponse> {
    const response = await apiClient.delete<TradeNoteResponse>(
      `${this.baseUrl}/${noteId}`,
    );
    return response;
  }

  async getTradeNotesByTradeId(
    tradeId: number,
    tradeType: "stock" | "option",
  ): Promise<TradeNoteInDB[]> {
    return this.getTradeNotes({ trade_id: tradeId, trade_type: tradeType });
  }

  async getTradeNotesByPhase(
    phase: "planning" | "execution" | "reflection",
  ): Promise<TradeNoteInDB[]> {
    return this.getTradeNotes({ phase });
  }

  async getTradeNotesByRating(rating: number): Promise<TradeNoteInDB[]> {
    return this.getTradeNotes({ rating });
  }

  async getTradeNotesByTags(tags: string[]): Promise<TradeNoteInDB[]> {
    return this.getTradeNotes({ tags });
  }
}

export const tradeNotesService = new TradeNotesService();
