import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';
import {
  OptionCreate,
  OptionUpdate,
  OptionInDB,
  OptionFilters,
  TradingStats,
  OptionType,
  TradeDirection,
} from '@/lib/types/trading';

export class OptionService {
  /**
   * Create a new options trade
   */
  async createOption(optionData: OptionCreate): Promise<OptionInDB> {
    return apiClient.post<OptionInDB>(apiConfig.endpoints.options.base, optionData);
  }

  /**
   * Get all options trades with optional filtering
   */
  async getOptions(filters?: OptionFilters): Promise<OptionInDB[]> {
    let endpoint = apiConfig.endpoints.options.base;

    if (filters) {
      const params = new URLSearchParams();

      if (filters.status) params.append('status', filters.status);
      if (filters.symbol) params.append('symbol', filters.symbol.toUpperCase());
      if (filters.strategy_type) params.append('strategy_type', filters.strategy_type);
      if (filters.option_type) params.append('option_type', filters.option_type);
      if (filters.expiration_date) params.append('expiration_date', filters.expiration_date);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.trade_direction) params.append('trade_direction', filters.trade_direction);

      const queryString = params.toString();
      if (queryString) {
        endpoint = `${endpoint}?${queryString}`;
      }
    }

    return apiClient.get<OptionInDB[]>(endpoint);
  }

  /**
   * Get a specific options trade by ID
   */
  async getOption(optionId: number): Promise<OptionInDB> {
    return apiClient.get<OptionInDB>(apiConfig.endpoints.options.byId(optionId));
  }

  /**
   * Update an options trade
   */
  async updateOption(optionId: number, updateData: OptionUpdate): Promise<OptionInDB> {
    return apiClient.put<OptionInDB>(
      apiConfig.endpoints.options.byId(optionId),
      updateData
    );
  }

  /**
   * Delete an options trade
   */
  async deleteOption(optionId: number): Promise<void> {
    return apiClient.delete<void>(apiConfig.endpoints.options.byId(optionId));
  }

  /**
   * Get open options positions
   */
  async getOpenPositions(): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(apiConfig.endpoints.options.open);
  }

  /**
   * Get closed options positions
   */
  async getClosedPositions(): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(apiConfig.endpoints.options.closed);
  }

  /**
   * Get options positions by symbol
   */
  async getPositionsBySymbol(symbol: string): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(apiConfig.endpoints.options.bySymbol(symbol));
  }

  /**
   * Get options positions by strategy type
   */
  async getPositionsByStrategy(strategy: string): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(apiConfig.endpoints.options.byStrategy(strategy));
  }

  /**
   * Get options positions by option type (Call/Put)
   */
  async getPositionsByOptionType(optionType: OptionType): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(apiConfig.endpoints.options.byOptionType(optionType));
  }

  /**
   * Get options positions by expiration date
   */
  async getPositionsByExpiration(expirationDate: string): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(apiConfig.endpoints.options.byExpiration(expirationDate));
  }

  /**
   * Get options positions within a date range
   */
  async getPositionsByDateRange(startDate: string, endDate: string): Promise<OptionInDB[]> {
    return apiClient.get<OptionInDB[]>(
      apiConfig.endpoints.options.dateRange(startDate, endDate)
    );
  }

  /**
   * Close an options position
   */
  async closePosition(
    optionId: number,
    exitPrice: number,
    exitDate?: string
  ): Promise<OptionInDB> {
    const updateData: OptionUpdate = {
      exit_price: exitPrice,
      exit_date: exitDate || new Date().toISOString(),
      status: 'closed',
    };

    return this.updateOption(optionId, updateData);
  }

  /**
   * Calculate profit/loss for an options trade
   */
  calculateProfitLoss(option: OptionInDB): number {
    if (!option.exit_price) return 0;

    const entryTotal = option.entry_price * option.number_of_contracts * 100; // Options are in lots of 100
    const exitTotal = option.exit_price * option.number_of_contracts * 100;
    const totalCommissions = option.commissions;

    // For options, we typically buy to open and sell to close
    // Long positions: P&L = (Exit Price - Entry Price) * Contracts * 100 - Commissions
    // Short positions would be the opposite, but most retail traders go long
    return exitTotal - entryTotal - totalCommissions;
  }

  /**
   * Calculate profit/loss percentage for an options trade
   */
  calculateProfitLossPercentage(option: OptionInDB): number {
    if (!option.exit_price) return 0;

    const profitLoss = this.calculateProfitLoss(option);
    const entryTotal = option.entry_price * option.number_of_contracts * 100;

    return entryTotal > 0 ? (profitLoss / entryTotal) * 100 : 0;
  }

  /**
   * Calculate maximum profit for an options trade
   */
  calculateMaxProfit(option: OptionInDB): number {
    if (option.max_profit !== undefined && option.max_profit !== null) {
      return option.max_profit;
    }

    // For simple long calls/puts, max profit is theoretically unlimited (calls) or strike price (puts)
    // This is a simplified calculation - in reality it depends on the strategy
    if (option.option_type === 'Call') {
      return Infinity; // Theoretically unlimited for long calls
    } else {
      // For long puts, max profit is strike price - premium paid
      const premiumPaid = option.entry_price * option.number_of_contracts * 100;
      return (option.strike_price * option.number_of_contracts * 100) - premiumPaid;
    }
  }

  /**
   * Calculate maximum loss for an options trade
   */
  calculateMaxLoss(option: OptionInDB): number {
    if (option.max_loss !== undefined && option.max_loss !== null) {
      return option.max_loss;
    }

    // For long options, max loss is the premium paid plus commissions
    return (option.entry_price * option.number_of_contracts * 100) + option.commissions;
  }

  /**
   * Calculate days to expiration
   */
  calculateDaysToExpiration(option: OptionInDB): number {
    const expirationDate = new Date(option.expiration_date);
    const currentDate = new Date();
    const timeDiff = expirationDate.getTime() - currentDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  /**
   * Check if option is ITM (In The Money)
   */
  isInTheMoney(option: OptionInDB): boolean | null {
    if (!option.underlying_price) return null;

    if (option.option_type === 'Call') {
      return option.underlying_price > option.strike_price;
    } else {
      return option.underlying_price < option.strike_price;
    }
  }

  /**
   * Calculate intrinsic value
   */
  calculateIntrinsicValue(option: OptionInDB): number {
    if (!option.underlying_price) return 0;

    if (option.option_type === 'Call') {
      return Math.max(0, option.underlying_price - option.strike_price);
    } else {
      return Math.max(0, option.strike_price - option.underlying_price);
    }
  }

  /**
   * Calculate time value (extrinsic value)
   */
  calculateTimeValue(option: OptionInDB): number {
    const intrinsicValue = this.calculateIntrinsicValue(option);
    const currentPrice = option.exit_price || option.entry_price;
    return Math.max(0, currentPrice - intrinsicValue);
  }

  /**
   * Get options by expiration proximity
   */
  async getOptionsExpiringWithin(days: number): Promise<OptionInDB[]> {
    const allOptions = await this.getOpenPositions();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    return allOptions.filter(option => {
      const expirationDate = new Date(option.expiration_date);
      return expirationDate <= targetDate;
    });
  }

  /**
   * Get trading statistics for options
   */
  async getTradingStats(): Promise<TradingStats> {
    const allTrades = await this.getOptions();
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

  /**
   * Get statistics by strategy type
   */
  async getStatsByStrategy(): Promise<Record<string, TradingStats>> {
    const allTrades = await this.getOptions();
    const strategies = [...new Set(allTrades.map(trade => trade.strategy_type))];

    const statsByStrategy: Record<string, TradingStats> = {};

    for (const strategy of strategies) {
      const strategyTrades = allTrades.filter(trade => trade.strategy_type === strategy);
      const closedTrades = strategyTrades.filter(trade => trade.status === 'closed');

      if (closedTrades.length > 0) {
        const profitLosses = closedTrades.map(trade => this.calculateProfitLoss(trade));
        const wins = profitLosses.filter(pl => pl > 0);
        const losses = profitLosses.filter(pl => pl < 0);

        const totalProfitLoss = profitLosses.reduce((sum, pl) => sum + pl, 0);
        const winRate = (wins.length / closedTrades.length) * 100;
        const averageWin = wins.length > 0 ? wins.reduce((sum, win) => sum + win, 0) / wins.length : 0;
        const averageLoss = losses.length > 0 ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;

        const totalWins = wins.reduce((sum, win) => sum + win, 0);
        const totalLosses = Math.abs(losses.reduce((sum, loss) => sum + loss, 0));

        statsByStrategy[strategy] = {
          total_trades: strategyTrades.length,
          open_trades: strategyTrades.filter(t => t.status === 'open').length,
          closed_trades: closedTrades.length,
          total_profit_loss: totalProfitLoss,
          win_rate: winRate,
          average_win: averageWin,
          average_loss: averageLoss,
          largest_win: wins.length > 0 ? Math.max(...wins) : 0,
          largest_loss: losses.length > 0 ? Math.min(...losses) : 0,
          profit_factor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
        };
      }
    }

    return statsByStrategy;
  }
}

// Export singleton instance
export const optionService = new OptionService();
export default optionService;
