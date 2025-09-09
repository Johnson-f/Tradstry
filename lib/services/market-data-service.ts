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
} from "@/lib/types/market-data";

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
  // COMPREHENSIVE OVERVIEW ENDPOINT
  // =====================================================

  async getSymbolOverview(symbol: string): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>(
      apiConfig.endpoints.marketData.overview(symbol)
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
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export default marketDataService;
