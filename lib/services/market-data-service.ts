import { apiClient } from "./api-client";
import { apiConfig } from "@/lib/config/api";
import type {
  HealthStatus,
  MarketHours,
  Quote,
  SimpleQuote,
  HistoricalResponse,
  MoversResponse,
  MoverItem,
  NewsItem,
  IndexItem,
  SectorPerformanceItem,
  SearchItem,
  IndicatorSeries,
  LogoUrl,
  GetQuotesRequest,
  GetHistoricalRequest,
  GetNewsRequest,
  GetIndicatorRequest,
  GetFinancialsRequest,
  FinancialsResponse,
  GetEarningsTranscriptRequest,
  EarningsTranscriptResponse,
  GetHoldersRequest,
  HoldersResponse,
  GetEarningsCalendarRequest,
  EarningsCalendarResponse,
  SubscribeRequest,
  UnsubscribeRequest,
} from "@/lib/types/market-data";

// Backend API response wrapper
interface BackendApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class MarketDataService {
  // Helper to unwrap backend ApiResponse wrapper
  private unwrapResponse<T>(response: BackendApiResponse<T>): T {
    if (!response.success || !response.data) {
      throw new Error(response.error || 'API request failed');
    }
    return response.data;
  }

  // =====================================================
  // MARKET ENGINE ENDPOINTS (from backend/src/service/market_engine)
  // =====================================================

  /**
   * Get market health status
   */
  async getHealth(): Promise<HealthStatus> {
    const response = await apiClient.get<BackendApiResponse<HealthStatus>>(apiConfig.endpoints.market.health);
    return this.unwrapResponse(response);
  }

  /**
   * Get market hours information
   */
  async getHours(): Promise<MarketHours> {
    const response = await apiClient.get<BackendApiResponse<MarketHours>>(apiConfig.endpoints.market.hours);
    return this.unwrapResponse(response);
  }

  /**
   * Get quotes for symbols
   */
  async getQuotes(params?: GetQuotesRequest): Promise<Quote[]> {
    const queryParams = params?.symbols?.length
      ? { symbols: params.symbols.join(",") }
      : undefined;
    const response = await apiClient.get<BackendApiResponse<Quote[]>>(apiConfig.endpoints.market.quotes, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get simple quotes for symbols (summary data)
   */
  async getSimpleQuotes(params?: GetQuotesRequest): Promise<SimpleQuote[]> {
    const queryParams = params?.symbols?.length
      ? { symbols: params.symbols.join(",") }
      : undefined;
    const response = await apiClient.get<BackendApiResponse<SimpleQuote[]>>(apiConfig.endpoints.market.simpleQuotes, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get similar quotes to a symbol
   */
  async getSimilar(symbol: string): Promise<SimpleQuote[]> {
    const response = await apiClient.get<BackendApiResponse<SimpleQuote[]>>(apiConfig.endpoints.market.similar, {
      params: { symbol },
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get logo URL for a symbol
   */
  async getLogo(symbol: string): Promise<LogoUrl> {
    const response = await apiClient.get<BackendApiResponse<LogoUrl>>(apiConfig.endpoints.market.logo, {
      params: { symbol },
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get historical data for a symbol
   */
  async getHistorical(params: GetHistoricalRequest): Promise<HistoricalResponse> {
    const queryParams: Record<string, string> = {
      symbol: params.symbol,
    };
    if (params.range) queryParams.range = params.range;
    if (params.interval) queryParams.interval = params.interval;

    const response = await apiClient.get<BackendApiResponse<HistoricalResponse>>(
      apiConfig.endpoints.market.historical,
      { params: queryParams }
    );
    return this.unwrapResponse(response);
  }

  /**
   * Get market movers (gainers, losers, most active)
   */
  async getMovers(): Promise<MoversResponse> {
    const response = await apiClient.get<BackendApiResponse<MoversResponse>>(apiConfig.endpoints.market.movers);
    return this.unwrapResponse(response);
  }

  /**
   * Get top gainers
   */
  async getGainers(count?: number): Promise<MoverItem[]> {
    const queryParams = count ? { count: count.toString() } : undefined;
    const response = await apiClient.get<BackendApiResponse<MoverItem[]>>(apiConfig.endpoints.market.gainers, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get top losers
   */
  async getLosers(count?: number): Promise<MoverItem[]> {
    const queryParams = count ? { count: count.toString() } : undefined;
    const response = await apiClient.get<BackendApiResponse<MoverItem[]>>(apiConfig.endpoints.market.losers, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get most active stocks
   */
  async getActives(count?: number): Promise<MoverItem[]> {
    const queryParams = count ? { count: count.toString() } : undefined;
    const response = await apiClient.get<BackendApiResponse<MoverItem[]>>(apiConfig.endpoints.market.actives, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get market news
   */
  async getNews(params?: GetNewsRequest): Promise<NewsItem[]> {
    const queryParams: Record<string, string> = {};
    if (params?.symbol) queryParams.symbol = params.symbol;
    if (params?.limit) queryParams.limit = params.limit.toString();

    const response = await apiClient.get<BackendApiResponse<NewsItem[]>>(apiConfig.endpoints.market.news, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get market indices
   */
  async getIndices(): Promise<IndexItem[]> {
    const response = await apiClient.get<BackendApiResponse<IndexItem[]>>(apiConfig.endpoints.market.indices);
    return this.unwrapResponse(response);
  }

  /**
   * Get sector performance
   */
  async getSectors(): Promise<SectorPerformanceItem[]> {
    const response = await apiClient.get<BackendApiResponse<SectorPerformanceItem[]>>(
      apiConfig.endpoints.market.sectors
    );
    return this.unwrapResponse(response);
  }

  /**
   * Search for symbols
   */
  async search(query: string, params?: { hits?: number; yahoo?: boolean }): Promise<SearchItem[]> {
    const queryParams: Record<string, string> = { q: query };
    if (params?.hits !== undefined) queryParams.hits = params.hits.toString();
    if (params?.yahoo !== undefined) queryParams.yahoo = params.yahoo.toString();
    const response = await apiClient.get<BackendApiResponse<SearchItem[]>>(apiConfig.endpoints.market.search, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get indicator data for a symbol
   */
  async getIndicator(
    params: GetIndicatorRequest
  ): Promise<IndicatorSeries> {
    const queryParams: Record<string, string> = {
      symbol: params.symbol,
      indicator: params.indicator,
    };
    if (params.interval) queryParams.interval = params.interval;

    const response = await apiClient.get<BackendApiResponse<IndicatorSeries>>(
      apiConfig.endpoints.market.indicators,
      { params: queryParams }
    );
    return this.unwrapResponse(response);
  }

  /**
   * Subscribe to market updates for symbols via WebSocket
   */
  async subscribe(params: SubscribeRequest): Promise<void> {
    await apiClient.post<BackendApiResponse<void>>(apiConfig.endpoints.market.subscribe, {
      symbols: params.symbols,
    });
    // Void response doesn't need unwrapping
    return;
  }

  /**
   * Unsubscribe from market updates for symbols via WebSocket
   */
  async unsubscribe(params: UnsubscribeRequest): Promise<void> {
    await apiClient.post<BackendApiResponse<void>>(apiConfig.endpoints.market.unsubscribe, {
      symbols: params.symbols,
    });
    // Void response doesn't need unwrapping
    return;
  }

  /**
   * Get financial statements for a symbol
   */
  async getFinancials(params: GetFinancialsRequest): Promise<FinancialsResponse> {
    const queryParams: Record<string, string> = {
      symbol: params.symbol,
    };
    if (params.statement) queryParams.statement = params.statement;
    if (params.frequency) queryParams.frequency = params.frequency;
    const response = await apiClient.get<BackendApiResponse<FinancialsResponse>>(apiConfig.endpoints.market.financials, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get earnings transcript for a symbol
   */
  async getEarningsTranscript(params: GetEarningsTranscriptRequest): Promise<EarningsTranscriptResponse> {
    const queryParams: Record<string, string> = {
      symbol: params.symbol,
    };
    if (params.quarter) queryParams.quarter = params.quarter;
    if (params.year) queryParams.year = params.year.toString();
    const response = await apiClient.get<BackendApiResponse<EarningsTranscriptResponse>>(apiConfig.endpoints.market.earningsTranscript, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }

  /**
   * Get holders data for a symbol
   */
  async getHolders(params: GetHoldersRequest): Promise<HoldersResponse> {
    const queryParams: Record<string, string> = {
      symbol: params.symbol,
    };
    if (params.holder_type) queryParams.holder_type = params.holder_type;
    const response = await apiClient.get<BackendApiResponse<HoldersResponse>>(apiConfig.endpoints.market.holders, {
      params: queryParams,
    });
    return this.unwrapResponse(response);
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export default marketDataService;
