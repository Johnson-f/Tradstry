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
  CompanyLogo,
  EarningsCalendarLogo,
  MarketMoversRequest,
  CompanyLogosRequest,
  EarningsCalendarLogosRequest,
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
  CreateWatchlistRequest,
  AddWatchlistItemRequest,
  DeleteWatchlistItemRequest,
  WatchlistResponse,
  DeleteResponse,
  StockPeersRequest,
  FinancialStatementRequest,
  KeyStatsRequest,
  KeyStats,
  IncomeStatement,
  BalanceSheet,
  CashFlow,
  // Enhanced types with real-time prices
  StockQuoteWithPrices,
  MarketMoverWithPrices,
  StockPeerWithPrices,
  WatchlistItemWithPrices,
  WatchlistWithItemsAndPrices,
  HistoricalDataRequest,
  HistoricalDataResponse,
  SingleSymbolDataRequest,
  // Holders Types
  HolderData,
  InstitutionalHolder,
  MutualFundHolder,
  InsiderTransaction,
  InsiderPurchasesSummary,
  InsiderRoster,
  HolderStatistics,
  HolderSearchResult,
  HolderParticipant,
  // Earnings Transcripts Types
  EarningsTranscript,
  EarningsTranscriptMetadata,
  TranscriptSearchResult,
  TranscriptStatistics,
  TranscriptParticipant,
  TranscriptQuarter,
  // Request Types
  HoldersRequest,
  InsiderTransactionsRequest,
  HoldersSearchRequest,
  HoldersPaginatedRequest,
  TranscriptsRequest,
  TranscriptSearchRequest,
  TranscriptsByDateRequest,
  TranscriptsPaginatedRequest,
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

  async getDailyEarningsSummary(
    params?: EarningsRequest,
  ): Promise<DailyEarningsSummary | null> {
    return apiClient.get<DailyEarningsSummary | null>(
      apiConfig.endpoints.marketData.earnings.dailySummary,
      { params },
    );
  }

  // =====================================================
  // COMPANY INFO ENDPOINTS
  // =====================================================

  async getCompanyInfo(
    symbol: string,
    dataProvider?: string,
  ): Promise<CompanyInfo | null> {
    return apiClient.get<CompanyInfo | null>(
      apiConfig.endpoints.marketData.companies.info(symbol),
      { params: { data_provider: dataProvider } },
    );
  }

  async getCompaniesBySector(
    params?: CompanySectorRequest,
  ): Promise<CompanyBasic[]> {
    return apiClient.get<CompanyBasic[]>(
      apiConfig.endpoints.marketData.companies.bySector,
      { params },
    );
  }

  async searchCompanies(
    params: CompanySearchTermRequest,
  ): Promise<CompanyBasic[]> {
    return apiClient.get<CompanyBasic[]>(
      apiConfig.endpoints.marketData.companies.search,
      { params },
    );
  }

  // =====================================================
  // MARKET NEWS ENDPOINTS
  // =====================================================

  async getLatestMarketNews(params?: MarketNewsRequest): Promise<MarketNews[]> {
    return apiClient.get<MarketNews[]>(
      apiConfig.endpoints.marketData.news.latest,
      { params },
    );
  }

  async getFilteredMarketNews(
    params?: FilteredNewsRequest,
  ): Promise<MarketNews[]> {
    return apiClient.get<MarketNews[]>(
      apiConfig.endpoints.marketData.news.filtered,
      { params },
    );
  }

  // =====================================================
  // FINANCE NEWS ENDPOINTS
  // =====================================================

  async getSymbolNews(params: SymbolNewsRequest): Promise<FinanceNews[]> {
    return apiClient.get<FinanceNews[]>(
      apiConfig.endpoints.marketData.news.symbol(params.symbol),
      { params },
    );
  }

  async getLatestSymbolNews(
    symbol: string,
    limit?: number,
  ): Promise<FinanceNews[]> {
    return apiClient.get<FinanceNews[]>(
      apiConfig.endpoints.marketData.news.symbolLatest(symbol),
      { params: { limit } },
    );
  }

  async getSymbolNewsStats(
    params: NewsStatsRequest,
  ): Promise<NewsStats | null> {
    return apiClient.get<NewsStats | null>(
      apiConfig.endpoints.marketData.news.symbolStats(params.symbol),
      { params: { days_back: params.days_back } },
    );
  }

  async searchSymbolNews(params: NewsSearchRequest): Promise<NewsSearch[]> {
    return apiClient.get<NewsSearch[]>(
      apiConfig.endpoints.marketData.news.symbolSearch(params.symbol),
      { params: { search_term: params.search_term, limit: params.limit } },
    );
  }

  // =====================================================
  // STOCK METRICS ENDPOINTS
  // =====================================================

  async getStockQuotes(params: StockQuoteRequest): Promise<StockQuote | null> {
    return apiClient.get<StockQuote | null>(
      apiConfig.endpoints.marketData.stocks.quotes(params.symbol),
      {
        params: {
          quote_date: params.quote_date,
          data_provider: params.data_provider,
        },
      },
    );
  }

  async getStockQuotesWithPrices(symbol: string): Promise<StockQuoteWithPrices | null> {
    return apiClient.get<StockQuoteWithPrices | null>(
      apiConfig.endpoints.marketData.stocks.quotesWithPrices(symbol),
    );
  }

  async getFundamentalData(
    params: FundamentalRequest,
  ): Promise<FundamentalData | null> {
    return apiClient.get<FundamentalData | null>(
      apiConfig.endpoints.marketData.stocks.fundamentals(params.symbol),
      { params: { data_provider: params.data_provider } },
    );
  }

  async getCombinedStockData(
    symbol: string,
    quoteDate?: string,
  ): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>(
      apiConfig.endpoints.marketData.stocks.combined(symbol),
      { params: { quote_date: quoteDate } },
    );
  }

  // =====================================================
  // PRICE MOVEMENTS ENDPOINTS
  // =====================================================

  async getSignificantPriceMovements(
    params?: PriceMovementRequest,
  ): Promise<PriceMovement[]> {
    return apiClient.get<PriceMovement[]>(
      apiConfig.endpoints.marketData.movements.significant,
      { params },
    );
  }

  async getTopMoversToday(params?: TopMoversRequest): Promise<TopMover[]> {
    return apiClient.get<TopMover[]>(
      apiConfig.endpoints.marketData.movements.topMoversToday,
      { params },
    );
  }

  // =====================================================
  // SYMBOL MANAGEMENT ENDPOINTS
  // =====================================================

  async checkSymbolExists(symbol: string): Promise<SymbolCheckResponse> {
    return apiClient.get<SymbolCheckResponse>(
      apiConfig.endpoints.marketData.symbols.check(symbol.toUpperCase()),
    );
  }

  async saveSymbolToDatabase(
    params: SymbolSaveRequest,
  ): Promise<SymbolSaveResponse> {
    return apiClient.post<SymbolSaveResponse>(
      apiConfig.endpoints.marketData.symbols.save,
      { symbol: params.symbol.toUpperCase() },
    );
  }

  // =====================================================
  // COMPREHENSIVE OVERVIEW ENDPOINT
  // =====================================================

  async getSymbolOverview(symbol: string): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>(
      apiConfig.endpoints.marketData.overview(symbol),
    );
  }

  // =====================================================
  // INDICES DATA ENDPOINTS
  // =====================================================

  async getHistoricalData(
    symbol: string,
    range: string = "1d",
    interval: string = "1m",
  ): Promise<HistoricalData> {
    const response = await fetch(
      `https://finance-query.onrender.com/v1/historical?symbol=${symbol}&range=${range}&interval=${interval}&epoch=true`,
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
        { params: { symbols: symbols.join(",") } },
      );

      // Transform the response to match our QuoteData interface
      return response.quotes.map((quote) => ({
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
      console.error("Error fetching quote data:", error);
      // Return default values for all symbols if API fails
      return symbols.map((symbol) => ({
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
  // ENHANCED MARKET MOVERS ENDPOINTS WITH REAL-TIME PRICES
  // =====================================================

  async getTopGainersWithPrices(params?: MarketMoversRequest): Promise<MarketMoverWithPrices[]> {
    return apiClient.get<MarketMoverWithPrices[]>(
      apiConfig.endpoints.marketData.movers.gainersWithPrices,
      { params },
    );
  }

  async getTopLosersWithPrices(params?: MarketMoversRequest): Promise<MarketMoverWithPrices[]> {
    return apiClient.get<MarketMoverWithPrices[]>(
      apiConfig.endpoints.marketData.movers.losersWithPrices,
      { params },
    );
  }

  async getMostActiveWithPrices(params?: MarketMoversRequest): Promise<MarketMoverWithPrices[]> {
    return apiClient.get<MarketMoverWithPrices[]>(
      apiConfig.endpoints.marketData.movers.mostActiveWithPrices,
      { params },
    );
  }

  async getMarketMoversOverviewWithPrices(params?: MarketMoversRequest): Promise<Record<string, any>> {
    return apiClient.get<Record<string, any>>(
      apiConfig.endpoints.marketData.movers.overviewWithPrices,
      { params },
    );
  }


  // =====================================================
  // COMPANY LOGOS ENDPOINTS
  // =====================================================

  async getCompanyLogos(request: CompanyLogosRequest): Promise<CompanyLogo[]> {
    return apiClient.post<CompanyLogo[]>(
      apiConfig.endpoints.marketData.logos.batch,
      request,
    );
  }

  async getEarningsCalendarLogos(
    request: EarningsCalendarLogosRequest,
  ): Promise<EarningsCalendarLogo[]> {
    return apiClient.post<EarningsCalendarLogo[]>(
      apiConfig.endpoints.marketData.logos.earningsCalendarBatch,
      request,
    );
  }


  // =====================================================
  // CACHING ENDPOINTS (replace with direct API calls)
  // =====================================================

  async getCachedSymbolData(
    symbol: string,
    limit: number = 100,
  ): Promise<CachedSymbolData | null> {
    return apiClient.get<CachedSymbolData | null>(
      `${apiConfig.endpoints.marketData.base}/cache/symbol/${symbol}`,
      { params: { limit } },
    );
  }

  async getMajorIndicesData(
    limit: number = 100,
  ): Promise<MajorIndicesResponse | null> {
    return apiClient.get<MajorIndicesResponse | null>(
      `${apiConfig.endpoints.marketData.base}/cache/major-indices`,
      { params: { limit } },
    );
  }

  // =====================================================
  // HISTORICAL PRICES ENDPOINTS
  // =====================================================

  async getHistoricalPrices(
    params: HistoricalPriceRequest,
  ): Promise<HistoricalPrice[]> {
    return apiClient.get<HistoricalPrice[]>(
      apiConfig.endpoints.marketData.historical.base(params.symbol),
      {
        params: {
          time_range: params.time_range,
          time_interval: params.time_interval,
          data_provider: params.data_provider,
          limit: params.limit,
        },
      },
    );
  }

  async getHistoricalPricesSummary(
    params: HistoricalPriceSummaryRequest,
  ): Promise<HistoricalPriceSummary[]> {
    return apiClient.get<HistoricalPriceSummary[]>(
      apiConfig.endpoints.marketData.historical.summary(params.symbol),
    );
  }

  async getLatestHistoricalPrices(
    params: LatestHistoricalPriceRequest,
  ): Promise<LatestHistoricalPrice[]> {
    return apiClient.get<LatestHistoricalPrice[]>(
      apiConfig.endpoints.marketData.historical.latest(params.symbol),
      { params: { limit: params.limit } },
    );
  }

  async getHistoricalPriceRange(
    params: HistoricalPriceRangeRequest,
  ): Promise<HistoricalPriceRange[]> {
    return apiClient.get<HistoricalPriceRange[]>(
      apiConfig.endpoints.marketData.historical.range(params.symbol),
      {
        params: {
          time_range: params.time_range,
          time_interval: params.time_interval,
          start_date: params.start_date,
          end_date: params.end_date,
          data_provider: params.data_provider,
        },
      },
    );
  }

  async getSymbolHistoricalOverview(
    symbol: string,
  ): Promise<SymbolHistoricalOverview> {
    return apiClient.get<SymbolHistoricalOverview>(
      apiConfig.endpoints.marketData.historical.overview(symbol),
    );
  }

  // =====================================================
  // SYMBOL SEARCH ENDPOINT
  // =====================================================

  async searchSymbols(
    params: SymbolSearchRequest,
  ): Promise<SymbolSearchResponse> {
    return apiClient.get<SymbolSearchResponse>(
      apiConfig.endpoints.marketData.search,
      { params },
    );
  }

  // =====================================================
  // WATCHLIST ENDPOINTS
  // =====================================================


  async createWatchlist(
    data: CreateWatchlistRequest,
  ): Promise<WatchlistResponse> {
    return apiClient.post<WatchlistResponse>(
      apiConfig.endpoints.marketData.watchlists.base,
      data,
    );
  }

  async deleteWatchlist(id: number): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      `${apiConfig.endpoints.marketData.watchlists.base}/${id}`,
    );
  }

  async addWatchlistItem(
    data: AddWatchlistItemRequest,
  ): Promise<WatchlistResponse> {
    return apiClient.post<WatchlistResponse>(
      apiConfig.endpoints.marketData.watchlists.addItem,
      data,
    );
  }

  async deleteWatchlistItem(itemId: number): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.deleteItem(itemId),
    );
  }

  async deleteWatchlistItemBySymbol(
    watchlistId: number,
    symbol: string,
  ): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.deleteBySymbol(
        watchlistId,
        symbol,
      ),
    );
  }

  async clearWatchlist(id: number): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(
      apiConfig.endpoints.marketData.watchlists.clear(id),
    );
  }

  // Enhanced watchlist methods with real-time prices
  async getWatchlistsWithPrices(): Promise<WatchlistWithItemsAndPrices[]> {
    return apiClient.get<WatchlistWithItemsAndPrices[]>(
      apiConfig.endpoints.marketData.watchlists.withPrices,
    );
  }

  async getWatchlistByIdWithPrices(id: number): Promise<WatchlistWithItemsAndPrices | null> {
    return apiClient.get<WatchlistWithItemsAndPrices | null>(
      apiConfig.endpoints.marketData.watchlists.byIdWithPrices(id),
    );
  }

  async getWatchlistItemsWithPrices(id: number): Promise<WatchlistItemWithPrices[]> {
    return apiClient.get<WatchlistItemWithPrices[]>(
      apiConfig.endpoints.marketData.watchlists.itemsWithPrices(id),
    );
  }

  // =====================================================
  // STOCK PEERS ENDPOINTS
  // =====================================================

  // Enhanced stock peers methods with real-time prices
  async getStockPeersWithPrices(params: StockPeersRequest): Promise<StockPeerWithPrices[]> {
    return apiClient.get<StockPeerWithPrices[]>(
      apiConfig.endpoints.marketData.peers.withPrices(params.symbol),
      { params: { data_date: params.data_date, limit: params.limit } },
    );
  }

  async getTopPerformingPeersWithPrices(params: StockPeersRequest): Promise<StockPeerWithPrices[]> {
    return apiClient.get<StockPeerWithPrices[]>(
      apiConfig.endpoints.marketData.peers.topPerformersWithPrices(params.symbol),
      { params: { data_date: params.data_date, limit: params.limit } },
    );
  }

  // =====================================================
  // HEALTH CHECK ENDPOINT
  // =====================================================

  async getHealthCheck(): Promise<MarketDataHealth> {
    return apiClient.get<MarketDataHealth>(
      apiConfig.endpoints.marketData.health,
    );
  }

  // =====================================================
  // ENHANCED CACHE ENDPOINTS
  // =====================================================

  async fetchHistoricalDataForSymbols(request: HistoricalDataRequest): Promise<HistoricalDataResponse> {
    return apiClient.post<HistoricalDataResponse>(
      apiConfig.endpoints.marketData.cache.historicalData,
      request,
    );
  }

  async fetchSingleSymbolData(request: SingleSymbolDataRequest): Promise<Record<string, any> | null> {
    return apiClient.post<Record<string, any> | null>(
      apiConfig.endpoints.marketData.cache.singleSymbol,
      request,
    );
  }

  async getSymbolHistoricalSummary(symbol: string, periodType: string = "5m"): Promise<Record<string, any> | null> {
    return apiClient.get<Record<string, any> | null>(
      apiConfig.endpoints.marketData.cache.historicalSummary(symbol),
      { params: { period_type: periodType } },
    );
  }

  // =====================================================
  // FINANCIAL STATEMENTS ENDPOINTS
  // =====================================================

  async getKeyStats(params: KeyStatsRequest): Promise<KeyStats | null> {
    return apiClient.get<KeyStats | null>(
      apiConfig.endpoints.marketData.financials.keyStats(params.symbol),
      { params: { frequency: params.frequency } },
    );
  }

  async getIncomeStatement(
    params: FinancialStatementRequest,
  ): Promise<IncomeStatement[]> {
    return apiClient.get<IncomeStatement[]>(
      apiConfig.endpoints.marketData.financials.incomeStatement(params.symbol),
      { params: { frequency: params.frequency, limit: params.limit } },
    );
  }

  async getBalanceSheet(
    params: FinancialStatementRequest,
  ): Promise<BalanceSheet[]> {
    return apiClient.get<BalanceSheet[]>(
      apiConfig.endpoints.marketData.financials.balanceSheet(params.symbol),
      { params: { frequency: params.frequency, limit: params.limit } },
    );
  }

  async getCashFlow(params: FinancialStatementRequest): Promise<CashFlow[]> {
    return apiClient.get<CashFlow[]>(
      apiConfig.endpoints.marketData.financials.cashFlow(params.symbol),
      { params: { frequency: params.frequency, limit: params.limit } },
    );
  }

  // =====================================================
  // HOLDERS DATA ENDPOINTS
  // =====================================================

  async getInstitutionalHolders(
    symbol: string,
    dateReported?: string,
    limit?: number,
  ): Promise<InstitutionalHolder[]> {
    return apiClient.get<InstitutionalHolder[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/institutional`,
      { 
        params: { 
          date_reported: dateReported,
          limit: limit || 50,
        } 
      },
    );
  }

  async getMutualFundHolders(
    symbol: string,
    dateReported?: string,
    limit?: number,
  ): Promise<MutualFundHolder[]> {
    return apiClient.get<MutualFundHolder[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/mutualfund`,
      { 
        params: { 
          date_reported: dateReported,
          limit: limit || 50,
        } 
      },
    );
  }

  async getInsiderTransactions(
    symbol: string,
    transactionType?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
  ): Promise<InsiderTransaction[]> {
    return apiClient.get<InsiderTransaction[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/insider-transactions`,
      { 
        params: { 
          transaction_type: transactionType,
          start_date: startDate,
          end_date: endDate,
          limit: limit || 100,
        } 
      },
    );
  }

  async getInsiderPurchasesSummary(
    symbol: string,
    summaryPeriod?: string,
  ): Promise<InsiderPurchasesSummary[]> {
    return apiClient.get<InsiderPurchasesSummary[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/insider-purchases`,
      { 
        params: { 
          summary_period: summaryPeriod,
        } 
      },
    );
  }

  async getInsiderRoster(
    symbol: string,
    limit?: number,
  ): Promise<InsiderRoster[]> {
    return apiClient.get<InsiderRoster[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/insider-roster`,
      { 
        params: { 
          limit: limit || 100,
        } 
      },
    );
  }

  async getAllHolders(
    symbol: string,
    holderType?: string,
    limit?: number,
  ): Promise<HolderData[]> {
    return apiClient.get<HolderData[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/all`,
      { 
        params: { 
          holder_type: holderType,
          limit: limit || 100,
        } 
      },
    );
  }

  async getTopInstitutionalHolders(
    orderBy?: string,
    limit?: number,
  ): Promise<InstitutionalHolder[]> {
    return apiClient.get<InstitutionalHolder[]>(
      `${apiConfig.endpoints.marketData.base}/holders/top-institutional`,
      { 
        params: { 
          order_by: orderBy || 'shares',
          limit: limit || 50,
        } 
      },
    );
  }

  async getRecentInsiderTransactions(
    transactionType?: string,
    daysBack?: number,
    limit?: number,
  ): Promise<InsiderTransaction[]> {
    return apiClient.get<InsiderTransaction[]>(
      `${apiConfig.endpoints.marketData.base}/holders/recent-insider-transactions`,
      { 
        params: { 
          transaction_type: transactionType,
          days_back: daysBack || 30,
          limit: limit || 100,
        } 
      },
    );
  }

  async getHolderStatistics(
    symbol: string,
  ): Promise<HolderStatistics[]> {
    return apiClient.get<HolderStatistics[]>(
      `${apiConfig.endpoints.marketData.base}/holders/${symbol}/statistics`,
    );
  }

  async searchHoldersByName(
    namePattern: string,
    holderType?: string,
    limit?: number,
  ): Promise<HolderSearchResult[]> {
    return apiClient.get<HolderSearchResult[]>(
      `${apiConfig.endpoints.marketData.base}/holders/search`,
      { 
        params: { 
          name_pattern: namePattern,
          holder_type: holderType,
          limit: limit || 50,
        } 
      },
    );
  }

  async getHoldersPaginated(
    params: HoldersPaginatedRequest,
  ): Promise<HolderData[]> {
    return apiClient.get<HolderData[]>(
      `${apiConfig.endpoints.marketData.base}/holders/paginated`,
      { params },
    );
  }

  // =====================================================
  // EARNINGS TRANSCRIPTS ENDPOINTS
  // =====================================================

  async getEarningsTranscripts(
    symbol: string,
    limit?: number,
  ): Promise<EarningsTranscript[]> {
    return apiClient.get<EarningsTranscript[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/${symbol}`,
      { 
        params: { 
          limit: limit || 10,
        } 
      },
    );
  }

  async getEarningsTranscriptByPeriod(
    symbol: string,
    year: number,
    quarter: string,
  ): Promise<EarningsTranscript | null> {
    return apiClient.get<EarningsTranscript | null>(
      `${apiConfig.endpoints.marketData.base}/transcripts/${symbol}/${year}/${quarter}`,
    );
  }

  async getLatestEarningsTranscript(
    symbol: string,
  ): Promise<EarningsTranscript | null> {
    return apiClient.get<EarningsTranscript | null>(
      `${apiConfig.endpoints.marketData.base}/transcripts/${symbol}/latest`,
    );
  }

  async getRecentEarningsTranscripts(
    daysBack?: number,
    limit?: number,
  ): Promise<EarningsTranscriptMetadata[]> {
    return apiClient.get<EarningsTranscriptMetadata[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/recent`,
      { 
        params: { 
          days_back: daysBack || 90,
          limit: limit || 50,
        } 
      },
    );
  }

  async searchEarningsTranscripts(
    searchText: string,
    symbol?: string,
    limit?: number,
  ): Promise<TranscriptSearchResult[]> {
    return apiClient.get<TranscriptSearchResult[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/search`,
      { 
        params: { 
          search_text: searchText,
          symbol: symbol,
          limit: limit || 20,
        } 
      },
    );
  }

  async getTranscriptsByParticipant(
    participantName: string,
    symbol?: string,
    limit?: number,
  ): Promise<EarningsTranscriptMetadata[]> {
    return apiClient.get<EarningsTranscriptMetadata[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/by-participant`,
      { 
        params: { 
          participant_name: participantName,
          symbol: symbol,
          limit: limit || 20,
        } 
      },
    );
  }

  async getTranscriptsByDateRange(
    startDate: string,
    endDate: string,
    symbol?: string,
    limit?: number,
  ): Promise<EarningsTranscriptMetadata[]> {
    return apiClient.get<EarningsTranscriptMetadata[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/by-date-range`,
      { 
        params: { 
          start_date: startDate,
          end_date: endDate,
          symbol: symbol,
          limit: limit || 100,
        } 
      },
    );
  }

  async getTranscriptsByYear(
    year: number,
    symbol?: string,
    limit?: number,
  ): Promise<EarningsTranscriptMetadata[]> {
    return apiClient.get<EarningsTranscriptMetadata[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/by-year/${year}`,
      { 
        params: { 
          symbol: symbol,
          limit: limit || 100,
        } 
      },
    );
  }

  async getTranscriptStatistics(
    symbol: string,
  ): Promise<TranscriptStatistics | null> {
    return apiClient.get<TranscriptStatistics | null>(
      `${apiConfig.endpoints.marketData.base}/transcripts/${symbol}/statistics`,
    );
  }

  async getTranscriptMetadata(
    symbol?: string,
    limit?: number,
  ): Promise<EarningsTranscriptMetadata[]> {
    return apiClient.get<EarningsTranscriptMetadata[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/metadata`,
      { 
        params: { 
          symbol: symbol,
          limit: limit || 50,
        } 
      },
    );
  }

  async getTranscriptsPaginated(
    params: TranscriptsPaginatedRequest,
  ): Promise<EarningsTranscriptMetadata[]> {
    return apiClient.get<EarningsTranscriptMetadata[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/paginated`,
      { params },
    );
  }

  async getUniqueTranscriptParticipants(
    symbol?: string,
    limit?: number,
  ): Promise<TranscriptParticipant[]> {
    return apiClient.get<TranscriptParticipant[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/participants`,
      { 
        params: { 
          symbol: symbol,
          limit: limit || 100,
        } 
      },
    );
  }

  async getTranscriptCountByQuarter(
    symbol?: string,
  ): Promise<TranscriptQuarter[]> {
    return apiClient.get<TranscriptQuarter[]>(
      `${apiConfig.endpoints.marketData.base}/transcripts/count-by-quarter`,
      { 
        params: { 
          symbol: symbol,
        } 
      },
    );
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export default marketDataService;
