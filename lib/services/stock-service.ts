import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';
import {
  StockCreate,
  StockUpdate,
  StockInDB,
  StockFilters,
  TradingStats,
} from '@/lib/types/trading';

export class StockService {
  /**
   * Create a new stock trade
   */
  async createStock(stockData: StockCreate): Promise<StockInDB> {
    return apiClient.post<StockInDB>(apiConfig.endpoints.stocks.base, stockData);
  }

  /**
   * Get all stock trades with optional filtering
   */
  async getStocks(filters?: StockFilters): Promise<StockInDB[]> {
    let endpoint = apiConfig.endpoints.stocks.base;

    if (filters) {
      const params = new URLSearchParams();

      if (filters.status) params.append('status', filters.status);
      if (filters.symbol) params.append('symbol', filters.symbol.toUpperCase());
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.trade_type) params.append('trade_type', filters.trade_type);
      if (filters.sector) params.append('sector', filters.sector);

      const queryString = params.toString();
      if (queryString) {
        endpoint = `${endpoint}?${queryString}`;
      }
    }

    return apiClient.get<StockInDB[]>(endpoint);
  }

  /**
   * Get a specific stock trade by ID
   */
  async getStock(stockId: number): Promise<StockInDB> {
    return apiClient.get<StockInDB>(apiConfig.endpoints.stocks.byId(stockId));
  }

  /**
   * Update a stock trade
   */
  async updateStock(stockId: number, updateData: StockUpdate): Promise<StockInDB> {
    return apiClient.put<StockInDB>(
      apiConfig.endpoints.stocks.byId(stockId),
      updateData
    );
  }

  /**
   * Delete a stock trade
   */
  async deleteStock(stockId: number): Promise<void> {
    return apiClient.delete<void>(apiConfig.endpoints.stocks.byId(stockId));
  }

  /**
   * Get open stock positions
   */
  async getOpenPositions(): Promise<StockInDB[]> {
    return apiClient.get<StockInDB[]>(apiConfig.endpoints.stocks.open);
  }

  /**
   * Get closed stock positions
   */
  async getClosedPositions(): Promise<StockInDB[]> {
    return apiClient.get<StockInDB[]>(apiConfig.endpoints.stocks.closed);
  }

  /**
   * Get stock positions by symbol
   */
  async getPositionsBySymbol(symbol: string): Promise<StockInDB[]> {
    return apiClient.get<StockInDB[]>(apiConfig.endpoints.stocks.bySymbol(symbol));
  }

  /**
   * Get stock positions within a date range
   */
  async getPositionsByDateRange(startDate: string, endDate: string): Promise<StockInDB[]> {
    return apiClient.get<StockInDB[]>(
      apiConfig.endpoints.stocks.dateRange(startDate, endDate)
    );
  }

  /**
   * Close a stock position
   */
  async closePosition(
    stockId: number,
    exitPrice: number,
    exitDate?: string
  ): Promise<StockInDB> {
    const updateData: StockUpdate = {
      exit_price: exitPrice,
      exit_date: exitDate || new Date().toISOString(),
      status: 'closed',
    };

    return this.updateStock(stockId, updateData);
  }

  /**
   * Calculate profit/loss for a stock trade
   */
  calculateProfitLoss(stock: StockInDB): number {
    if (!stock.exit_price) return 0;

    const entryTotal = stock.entry_price * stock.number_shares;
    const exitTotal = stock.exit_price * stock.number_shares;
    const totalCommissions = stock.commissions;

    if (stock.trade_type === 'BUY') {
      return exitTotal - entryTotal - totalCommissions;
    } else {
      return entryTotal - exitTotal - totalCommissions;
    }
  }

  /**
   * Calculate profit/loss percentage for a stock trade
   */
  calculateProfitLossPercentage(stock: StockInDB): number {
    if (!stock.exit_price) return 0;

    const profitLoss = this.calculateProfitLoss(stock);
    const entryTotal = stock.entry_price * stock.number_shares;

    return (profitLoss / entryTotal) * 100;
  }

  /**
   * Calculate risk/reward ratio
   */
  calculateRiskRewardRatio(stock: StockBase): number {
    if (!stock.take_profit) return 0;

    const entryPrice = stock.entry_price;
    const stopLoss = stock.stop_loss;
    const takeProfit = stock.take_profit;

    if (stock.trade_type === 'BUY') {
      const risk = entryPrice - stopLoss;
      const reward = takeProfit - entryPrice;
      return risk > 0 ? reward / risk : 0;
    } else {
      const risk = stopLoss - entryPrice;
      const reward = entryPrice - takeProfit;
      return risk > 0 ? reward / risk : 0;
    }
  }

  /**
   * Get trading statistics for stocks
   */
  async getTradingStats(): Promise<TradingStats> {
    const allTrades = await this.getStocks();
    const closedTrades = allTrades.filter(trade => trade.status === 'closed');
    const openTrades = allTrades.filter(trade => trade.status === 'open');

    if (closedTrades.length === 0) {
      return {
        total_trades: allTrades.length,
        open_trades: openTrades.length,
        closed_trades: 0,
        total_profit_loss: 0,
        win_rate: 0,
        average_win: 0,
        average_loss: 0,
        largest_win: 0,
        largest_loss: 0,
        profit_factor: 0,
      };
    }

    const profitLosses = closedTrades.map(trade => this.calculateProfitLoss(trade));
    const wins = profitLosses.filter(pl => pl > 0);
    const losses = profitLosses.filter(pl => pl < 0);

    const totalProfitLoss = profitLosses.reduce((sum, pl) => sum + pl, 0);
    const winRate = (wins.length / closedTrades.length) * 100;
    const averageWin = wins.length > 0 ? wins.reduce((sum, win) => sum + win, 0) / wins.length : 0;
    const averageLoss = losses.length > 0 ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;
    const largestWin = wins.length > 0 ? Math.max(...wins) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses) : 0;

    const totalWins = wins.reduce((sum, win) => sum + win, 0);
    const totalLosses = Math.abs(losses.reduce((sum, loss) => sum + loss, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    return {
      total_trades: allTrades.length,
      open_trades: openTrades.length,
      closed_trades: closedTrades.length,
      total_profit_loss: totalProfitLoss,
      win_rate: winRate,
      average_win: averageWin,
      average_loss: averageLoss,
      largest_win: largestWin,
      largest_loss: largestLoss,
      profit_factor: profitFactor,
    };
  }
}

// Export singleton instance
export const stockService = new StockService();
export default stockService;
