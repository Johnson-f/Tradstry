import { apiClient } from "./api-client";
import { apiConfig } from "@/lib/config/api";
import type {
  DailyEarningsSummary,
  CompanyInfo,
  CompanyBasic,
  MarketNews,
  FinanceNews,
  NewsStats,
  NewsSearch,
  StockQuote,
  FundamentalData,
  PriceMovement,
  TopMover,
  EarningsRequest,
  CompanySectorRequest,
  CompanySearchTermRequest,
  MarketNewsRequest,
  FilteredNewsRequest,
  SymbolNewsRequest,
  NewsStatsRequest,
  NewsSearchRequest,
  StockQuoteRequest,
  FundamentalRequest,
  PriceMovementRequest,
  TopMoversRequest,
  MarketDataHealth,
  HistoricalData,
  QuoteData,
  MarketMover,
  MarketMoverWithLogo,
  CompanyLogo,
  EarningsCalendarLogo,
  MarketMoversRequest,
  CompanyLogosRequest,
  EarningsCalendarLogosRequest,
  MarketMoversOverview,
  SymbolCheckResponse,
  SymbolSaveRequest,
  SymbolSaveResponse,
  CachedSymbolData,
  MajorIndicesResponse,
  HistoricalPrice,
  HistoricalPriceSummary,
  LatestHistoricalPrice,
  HistoricalPriceRange,
  HistoricalPriceRequest,
  HistoricalPriceSummaryRequest,
  LatestHistoricalPriceRequest,
  HistoricalPriceRangeRequest,
  SymbolHistoricalOverview,
  SymbolSearchRequest,
  SymbolSearchResponse,
  QuoteResponse,
  Watchlist,
  WatchlistItem,
  WatchlistWithItems,
  CreateWatchlistRequest,
  AddWatchlistItemRequest,
  DeleteWatchlistItemRequest,
  WatchlistResponse,
  DeleteResponse,
  StockPeer,
  PeerComparison,
  StockPeersRequest,
  PeersPaginatedRequest,
  FinancialStatementRequest,
  KeyStatsRequest,
  KeyStats,
  IncomeStatement,
  BalanceSheet,
  CashFlow,
} from "@/lib/types/market-data";

// Raw API response type for market movers (strings that need to be transformed to numbers)
interface RawMarketMover {
  symbol: string;
  name?: string;
  price: string;
  change: string;
  percent_change: string;
  fetch_timestamp?: string;
  logo?: string;
}

// External API response types for legacy endpoints
interface ExternalMoverData {
  name?: string;
  price?: string | number;
  change?: string | number;
  changePercent?: string | number;
  percentChange?: string | number;
  change_percent?: string | number;
  percent_change?: string | number;
}

class MarketDataService {
  // =====================================================
  // EARNINGS ENDPOINTS
  // =====================================================

  async getDailyEarningsSummary(params?: EarningsRequest): Promise<DailyEarningsSummary | null> {
    return apiClient.get<DailyEarningsSummary | null>(
      apiConfig.endpoints.marketData.earnings.dailySummary,
      { params }
    );
  }

  // =====================================================
  // COMPANY INFO ENDPOINTS
  // =====================================================

  async getCompanyInfo(symbol: string, dataProvider?: string): Promise<CompanyInfo | null> {
    return apiClient.get<CompanyInfo | null>(
      apiConfig.endpoints.marketData.companies.info(symbol),
      { params: { data_provider: dataProvider } }
    );
  }

  async getCompaniesBySector(params?: CompanySectorRequest): Promise<CompanyBasic[]> {
    return apiClient.get<CompanyBasic[]>(
      apiConfig.endpoints.marketData.companies.bySector,
      { params }
    );
  }

  async searchCompanies(params: CompanySearchTermRequest): Promise<CompanyBasic[]> {
    return apiClient.get<CompanyBasic[]>(
      apiConfig.endpoints.marketData.companies.search,
      { params }
    );
  }

  // =====================================================
  // MARKET NEWS ENDPOINTS
  // =====================================================

  async getLatestMarketNews(params?: MarketNewsRequest): Promise<MarketNews[]> {
    return apiClient.get<MarketNews[]>(
      apiConfig.endpoints.marketData.news.latest,
      { params }
    );
  }

  async getFilteredMarketNews(params?: FilteredNewsRequest): Promise<MarketNews[]> {
    return apiClient.get<MarketNews[]>(
      apiConfig.endpoints.marketData.news.filtered,
      { params }
    );
  }

  // =====================================================
  // FINANCE NEWS ENDPOINTS
  // =====================================================

  async getSymbolNews(params: SymbolNewsRequest): Promise<FinanceNews[]> {
    return apiClient.get<FinanceNews[]>(
      apiConfig.endpoints.marketData.news.symbol(params.symbol),
      { params }
    );
  }

  async getLatestSymbolNews(symbol: string, limit?: number): Promise<FinanceNews[]> {
    return apiClient.get<FinanceNews[]>(
      apiConfig.endpoints.marketData.news.symbolLatest(symbol),
      { params: { limit } }
    );
  }

  async getSymbolNewsStats(params: NewsStatsRequest): Promise<NewsStats | null> {
    return apiClient.get<NewsStats | null>(
      apiConfig.endpoints.marketData.news.symbolStats(params.symbol),
      { params: { days_back: params.days_back } }
    );
  }

  async searchSymbolNews(params: NewsSearchRequest): Promise<NewsSearch[]> {
    return apiClient.get<NewsSearch[]>(
      apiConfig.endpoints.marketData.news.symbolSearch(params.symbol),
      { params: { search_term: params.search_term, limit: params.limit } }
    );
  }

  // =====================================================
  // STOCK METRICS ENDPOINTS
  // =====================================================

  async getStockQuotes(params: StockQuoteRequest): Promise<StockQuote | null> {
    return apiClient.get<StockQuote | null>(
      apiConfig.endpoints.marketData.stocks.quotes(params.symbol),
      { params: { quote_date: params.quote_date, data_provider: params.data_provider } }
    );
  }

  async getFundamentalData(params: FundamentalRequest): Promise<FundamentalData | null> {
    return apiClient.get<FundamentalData | null>(
      apiConfig.endpoints.marketData.stocks.fundamentals(params.symbol),
      { params: { data_provider: params.data_provider } }
    );
  }

  async getCombinedStockData(symbol: string, quoteDate?: string): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>(
      apiConfig.endpoints.marketData.stocks.combined(symbol),
      { params: { quote_date: quoteDate } }
    );
  }

  // =====================================================
  // PRICE MOVEMENTS ENDPOINTS
  // =====================================================

  async getSignificantPriceMovements(params?: PriceMovementRequest): Promise<PriceMovement[]> {
    return apiClient.get<PriceMovement[]>(
      apiConfig.endpoints.marketData.movements.significant,
      { params }
    );
  }

  async getTopMoversToday(params?: TopMoversRequest): Promise<TopMover[]> {
    return apiClient.get<TopMover[]>(
      apiConfig.endpoints.marketData.movements.topMoversToday,
      { params }
    );
  }

  // =====================================================
  // SYMBOL MANAGEMENT ENDPOINTS
  // =====================================================

  async checkSymbolExists(symbol: string): Promise<SymbolCheckResponse> {
    return apiClient.get<SymbolCheckResponse>(
      apiConfig.endpoints.marketData.symbols.check(symbol.toUpperCase())
    );
  }

  async saveSymbolToDatabase(params: SymbolSaveRequest): Promise<SymbolSaveResponse> {
    return apiClient.post<SymbolSaveResponse>(
      apiConfig.endpoints.marketData.symbols.save,
      { symbol: params.symbol.toUpperCase() }
    );
  }

  // =====================================================
  // COMPREHENSIVE OVERVIEW ENDPOINT
  // =====================================================

  async getSymbolOverview(symbol: string): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>(
      apiConfig.endpoints.marketData.overview(symbol)
    );
  }

  // =====================================================
  // INDICES DATA ENDPOINTS
  // =====================================================

  async getHistoricalData(symbol: string, range: string = '1d', interval: string = '1m'): Promise<HistoricalData> {
    const response = await fetch(
      `https://finance-query.onrender.com/v1/historical?symbol=${symbol}&range=${range}&interval=${interval}&epoch=true`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch historical data for ${symbol}`);
    }
    
    return response.json();
  }

  async getQuoteData(symbols: string[]): Promise<QuoteData[]> {
    try {
      // Use the backend endpoint instead of direct external API call
      const response = await apiClient.get<QuoteResponse>(
        apiConfig.endpoints.marketData.quotes,
        { params: { symbols: symbols.join(',') } }
      );
      
      // Transform the response to match our QuoteData interface
      return response.quotes.map(quote => ({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        volume: quote.volume,
        marketCap: quote.marketCap,
        logo: quote.logo,
      }));
    } catch (error) {
      console.error('Error fetching quote data:', error);
      // Return default values for all symbols if API fails
      return symbols.map(symbol => ({
        symbol,
        name: symbol,
        price: 0,
        change: 0,
        changePercent: 0,
        dayHigh: 0,
        dayLow: 0,
        volume: 0,
      }));
    }
  }

  // =====================================================
  // MARKET MOVERS ENDPOINTS (NEW BACKEND INTEGRATION)
  // =====================================================

  async getTopGainers(params?: MarketMoversRequest): Promise<MarketMover[]> {
    const data = await apiClient.get<RawMarketMover[]>(
      apiConfig.endpoints.marketData.movers.gainers,
      { params }
    );
    
    // Transform string values to numbers
    return data.map((item: RawMarketMover) => ({
      symbol: item.symbol,
      name: item.name,
      price: parseFloat(item.price) || 0,
      change: parseFloat(item.change) || 0,
      percent_change: parseFloat(item.percent_change) || 0,
      changePercent: parseFloat(item.percent_change) || 0, // Legacy field
      fetch_timestamp: item.fetch_timestamp,
      logo: item.logo,
    }));
  }

  async getTopLosers(params?: MarketMoversRequest): Promise<MarketMover[]> {
    const data = await apiClient.get<RawMarketMover[]>(
      apiConfig.endpoints.marketData.movers.losers,
      { params }
    );
    
    // Transform string values to numbers
    return data.map((item: RawMarketMover) => ({
      symbol: item.symbol,
      name: item.name,
      price: parseFloat(item.price) || 0,
      change: parseFloat(item.change) || 0,
      percent_change: parseFloat(item.percent_change) || 0,
      changePercent: parseFloat(item.percent_change) || 0, // Legacy field
      fetch_timestamp: item.fetch_timestamp,
      logo: item.logo,
    }));
  }

  async getMostActive(params?: MarketMoversRequest): Promise<MarketMover[]> {
    const data = await apiClient.get<RawMarketMover[]>(
      apiConfig.endpoints.marketData.movers.mostActive,
      { params }
    );
    
    // Transform string values to numbers
    return data.map((item: RawMarketMover) => ({
      symbol: item.symbol,
      name: item.name,
      price: parseFloat(item.price) || 0,
      change: parseFloat(item.change) || 0,
      percent_change: parseFloat(item.percent_change) || 0,
      changePercent: parseFloat(item.percent_change) || 0, // Legacy field
      fetch_timestamp: item.fetch_timestamp,
      logo: item.logo,
    }));
  }

  async getTopGainersWithLogos(params?: MarketMoversRequest): Promise<MarketMoverWithLogo[]> {
    return apiClient.get<MarketMoverWithLogo[]>(
      apiConfig.endpoints.marketData.movers.gainersWithLogos,
      { params }
    );
  }

  async getTopLosersWithLogos(params?: MarketMoversRequest): Promise<MarketMoverWithLogo[]> {
    return apiClient.get<MarketMoverWithLogo[]>(
      apiConfig.endpoints.marketData.movers.losersWithLogos,
      { params }
    );
  }

  async getMostActiveWithLogos(params?: MarketMoversRequest): Promise<MarketMoverWithLogo[]> {
    return apiClient.get<MarketMoverWithLogo[]>(
      apiConfig.endpoints.marketData.movers.mostActiveWithLogos,
      { params }
    );
  }

  async getMarketMoversOverview(params?: MarketMoversRequest): Promise<MarketMoversOverview> {
    return apiClient.get<MarketMoversOverview>(
      apiConfig.endpoints.marketData.movers.overview,
      { params }
    );
  }

  // =====================================================
  // COMPANY LOGOS ENDPOINTS
  // =====================================================

  async getCompanyLogos(request: CompanyLogosRequest): Promise<CompanyLogo[]> {
    return apiClient.post<CompanyLogo[]>(
      apiConfig.endpoints.marketData.logos.batch,
      request
    );
  }

  async getEarningsCalendarLogos(request: EarningsCalendarLogosRequest): Promise<EarningsCalendarLogo[]> {
    return apiClient.post<EarningsCalendarLogo[]>(
      apiConfig.endpoints.marketData.logos.earningsCalendarBatch,
      request
    );
  }

  // =====================================================
  // LEGACY MARKET MOVERS ENDPOINTS (EXTERNAL API)
  // =====================================================

  async getGainers(count: number = 25): Promise<MarketMover[]> {
    const response = await fetch(
      `https://finance-query.onrender.com/v1/gainers?count=${count}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch gainers data');
    }
    
    const data = await response.json();
    
    
    // Transform the response to match our MarketMover interface
    const transformed = Object.entries(data as Record<string, ExternalMoverData>).map(([symbol, moverData]) => ({
      symbol,
      name: moverData.name || symbol,
      price: parseFloat(String(moverData.price)) || 0,
      change: parseFloat(String(moverData.change)) || 0,
      percent_change: parseFloat(String(moverData.changePercent || moverData.percentChange || moverData.change_percent || moverData.percent_change)) || 0,
      changePercent: parseFloat(String(moverData.changePercent || moverData.percentChange || moverData.change_percent || moverData.percent_change)) || 0,
    }));
    return transformed;
  }

  async getLosers(count: number = 25): Promise<MarketMover[]> {
    const response = await fetch(
      `https://finance-query.onrender.com/v1/losers?count=${count}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch losers data');
    }
    
    const data = await response.json();
    
    
    // Transform the response to match our MarketMover interface
    const transformed = Object.entries(data as Record<string, ExternalMoverData>).map(([symbol, moverData]) => ({
      symbol,
      name: moverData.name || symbol,
      price: parseFloat(String(moverData.price)) || 0,
      change: parseFloat(String(moverData.change)) || 0,
      percent_change: parseFloat(String(moverData.changePercent)) || 0,
      changePercent: parseFloat(String(moverData.changePercent)) || 0, // Add legacy field
    }));
    
    
    return transformed;
  }

  async getActives(count: number = 25): Promise<MarketMover[]> {
    const response = await fetch(
      `https://finance-query.onrender.com/v1/actives?count=${count}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch actives data');
    }
    
    const data = await response.json();
    
    
    // Transform the response to match our MarketMover interface
    const transformed = Object.entries(data as Record<string, ExternalMoverData>).map(([symbol, moverData]) => ({
      symbol,
      name: moverData.name || symbol,
      price: parseFloat(String(moverData.price)) || 0,
      change: parseFloat(String(moverData.change)) || 0,
      percent_change: parseFloat(String(moverData.changePercent)) || 0,
      changePercent: parseFloat(String(moverData.changePercent)) || 0, // Add legacy field
    }));
    
    
    return transformed;
  }

  // =====================================================
  // CACHING ENDPOINTS
  // =====================================================

  async getCachedSymbolData(symbol: string, limit: number = 100): Promise<CachedSymbolData | null> {
    return apiClient.get<CachedSymbolData | null>(
      `${apiConfig.endpoints.marketData.base}/cache/symbol/${symbol}`,
      { params: { limit } }
    );
  }

  async getMajorIndicesData(limit: number = 100): Promise<MajorIndicesResponse | null> {
    return apiClient.get<MajorIndicesResponse | null>(
      `${apiConfig.endpoints.marketData.base}/cache/major-indices`,
      { params: { limit } }
    );
  }

  // =====================================================
  // HISTORICAL PRICES ENDPOINTS
  // =====================================================

  async getHistoricalPrices(params: HistoricalPriceRequest): Promise<HistoricalPrice[]> {
    return apiClient.get<HistoricalPrice[]>(
      apiConfig.endpoints.marketData.historical.base(params.symbol),
      { 
        params: {
          time_range: params.time_range,
          time_interval: params.time_interval,
          data_provider: params.data_provider,
          limit: params.limit
        }
      }
    );
  }

  async getHistoricalPricesSummary(params: HistoricalPriceSummaryRequest): Promise<HistoricalPriceSummary[]> {
    return apiClient.get<HistoricalPriceSummary[]>(
      apiConfig.endpoints.marketData.historical.summary(params.symbol)
    );
  }

  async getLatestHistoricalPrices(params: LatestHistoricalPriceRequest): Promise<LatestHistoricalPrice[]> {
    return apiClient.get<LatestHistoricalPrice[]>(
      apiConfig.endpoints.marketData.historical.latest(params.symbol),
      { params: { limit: params.limit } }
    );
  }

  async getHistoricalPriceRange(params: HistoricalPriceRangeRequest): Promise<HistoricalPriceRange[]> {
    return apiClient.get<HistoricalPriceRange[]>(
      apiConfig.endpoints.marketData.historical.range(params.symbol),
      {
        params: {
          time_range: params.time_range,
          time_interval: params.time_interval,
          start_date: params.start_date,
          end_date: params.end_date,
          data_provider: params.data_provider
        }
      }
    );
  }

  async getSymbolHistoricalOverview(symbol: string): Promise<SymbolHistoricalOverview> {
    return apiClient.get<SymbolHistoricalOverview>(
      apiConfig.endpoints.marketData.historical.overview(symbol)
    );
  }

  // =====================================================
  // SYMBOL SEARCH ENDPOINT
  // =====================================================

  async searchSymbols(params: SymbolSearchRequest): Promise<SymbolSearchResponse> {
    return apiClient.get<SymbolSearchResponse>(
      apiConfig.endpoints.marketData.search,
      { params }
    );
  }

  // =====================================================
  // WATCHLIST ENDPOINTS
  // =====================================================

  async getWatchlists(): Promise<Watchlist[]> {
    return apiClient.get<Watchlist[]>(
      apiConfig.endpoints.marketData.watchlists.base
    );
  }

  async getWatchlistById(id: number): Promise<WatchlistWithItems | null> {
    return apiClient.get<WatchlistWithItems | null>(
      apiConfig.endpoints.marketData.watchlists.byId(id)
    );
  }

  async createWatchlist(data: CreateWatchlistRequest): Promise<WatchlistResponse> {
    return apiClient.post<WatchlistResponse>(
      apiConfig.endpoints.marketData.watchlists.base,
      data
    );
  }

  async deleteWatchlist(id: number): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.byId(id)
    );
  }

  async getWatchlistItems(id: number): Promise<WatchlistItem[]> {
    return apiClient.get<WatchlistItem[]>(
      apiConfig.endpoints.marketData.watchlists.items(id)
    );
  }

  async addWatchlistItem(data: AddWatchlistItemRequest): Promise<WatchlistResponse> {
    return apiClient.post<WatchlistResponse>(
      apiConfig.endpoints.marketData.watchlists.addItem,
      data
    );
  }

  async deleteWatchlistItem(itemId: number): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.deleteItem(itemId)
    );
  }

  async deleteWatchlistItemBySymbol(watchlistId: number, symbol: string): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.deleteBySymbol(watchlistId, symbol)
    );
  }

  async clearWatchlist(id: number): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.clear(id)
    );
  }

  // =====================================================
  // STOCK PEERS ENDPOINTS
  // =====================================================

  async getStockPeers(params: StockPeersRequest): Promise<StockPeer[]> {
    return apiClient.get<StockPeer[]>(
      apiConfig.endpoints.marketData.peers.base(params.symbol),
      { params: { data_date: params.data_date, limit: params.limit } }
    );
  }

  async getTopPerformingPeers(params: StockPeersRequest): Promise<StockPeer[]> {
    return apiClient.get<StockPeer[]>(
      apiConfig.endpoints.marketData.peers.topPerformers(params.symbol),
      { params: { data_date: params.data_date, limit: params.limit } }
    );
  }

  async getWorstPerformingPeers(params: StockPeersRequest): Promise<StockPeer[]> {
    return apiClient.get<StockPeer[]>(
      apiConfig.endpoints.marketData.peers.worstPerformers(params.symbol),
      { params: { data_date: params.data_date, limit: params.limit } }
    );
  }

  async getPeerComparison(params: StockPeersRequest): Promise<PeerComparison[]> {
    return apiClient.get<PeerComparison[]>(
      apiConfig.endpoints.marketData.peers.comparison(params.symbol),
      { params: { data_date: params.data_date, limit: params.limit } }
    );
  }

  async getPeersPaginated(params: PeersPaginatedRequest): Promise<{ peers: StockPeer[]; total: number; offset: number; limit: number }> {
    return apiClient.get<{ peers: StockPeer[]; total: number; offset: number; limit: number }>(
      apiConfig.endpoints.marketData.peers.paginated(params.symbol),
      { 
        params: { 
          data_date: params.data_date,
          offset: params.offset,
          limit: params.limit,
          sort_column: params.sort_column,
          sort_direction: params.sort_direction
        } 
      }
    );
  }

  // =====================================================
  // HEALTH CHECK ENDPOINT
  // =====================================================

  async getHealthCheck(): Promise<MarketDataHealth> {
    return apiClient.get<MarketDataHealth>(
      apiConfig.endpoints.marketData.health
    );
  }

  // =====================================================
  // FINANCIAL STATEMENTS ENDPOINTS
  // =====================================================

  async getKeyStats(params: KeyStatsRequest): Promise<KeyStats | null> {
    return apiClient.get<KeyStats | null>(
      apiConfig.endpoints.marketData.financials.keyStats(params.symbol),
      { params: { frequency: params.frequency } }
    );
  }

  async getIncomeStatement(params: FinancialStatementRequest): Promise<IncomeStatement[]> {
    return apiClient.get<IncomeStatement[]>(
      apiConfig.endpoints.marketData.financials.incomeStatement(params.symbol),
      { params: { frequency: params.frequency, limit: params.limit } }
    );
  }

  async getBalanceSheet(params: FinancialStatementRequest): Promise<BalanceSheet[]> {
    return apiClient.get<BalanceSheet[]>(
      apiConfig.endpoints.marketData.financials.balanceSheet(params.symbol),
      { params: { frequency: params.frequency, limit: params.limit } }
    );
  }

  async getCashFlow(params: FinancialStatementRequest): Promise<CashFlow[]> {
    return apiClient.get<CashFlow[]>(
      apiConfig.endpoints.marketData.financials.cashFlow(params.symbol),
      { params: { frequency: params.frequency, limit: params.limit } }
    );
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export default marketDataService;
