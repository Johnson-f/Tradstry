"""
YFinance service for fetching earnings and fundamental data.
Handles data extraction, transformation, and validation from yfinance.
"""

import yfinance as yf
import pandas as pd
from datetime import datetime, date
from typing import Dict, List, Optional, Any
from decimal import Decimal
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class EarningsData:
    """Data structure for earnings information"""
    symbol: str
    fiscal_year: int
    fiscal_quarter: int
    reported_date: date
    eps: Optional[float] = None
    eps_estimated: Optional[float] = None
    revenue: Optional[int] = None
    revenue_estimated: Optional[int] = None
    net_income: Optional[int] = None
    gross_profit: Optional[int] = None
    operating_income: Optional[int] = None
    ebitda: Optional[int] = None
    data_provider: str = "yfinance"

@dataclass
class FundamentalData:
    """Data structure for fundamental information"""
    symbol: str
    fiscal_year: int
    fiscal_quarter: Optional[int]
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    gross_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    net_margin: Optional[float] = None
    current_ratio: Optional[float] = None
    debt_to_equity: Optional[float] = None
    eps: Optional[float] = None
    book_value_per_share: Optional[float] = None
    market_cap: Optional[int] = None
    beta: Optional[float] = None
    shares_outstanding: Optional[int] = None
    sector: Optional[str] = None
    data_provider: str = "yfinance"


class YFinanceService:
    """Service for fetching financial data from Yahoo Finance"""
    
    def __init__(self):
        self.cache = {}
        self.cache_timeout = 3600  # 1 hour cache
    
    def fetch_earnings_data(self, symbol: str) -> List[EarningsData]:
        """
        Fetch earnings data for a symbol from yfinance.
        Returns a list of EarningsData objects.
        """
        try:
            ticker = yf.Ticker(symbol)
            earnings_data = []
            
            # Get quarterly income statement (replaces deprecated quarterly_earnings)
            quarterly_income = ticker.quarterly_income_stmt
            if quarterly_income is not None and not quarterly_income.empty:
                for date_col in quarterly_income.columns:
                    try:
                        # Parse the date and extract fiscal info
                        report_date = pd.to_datetime(date_col).date()
                        fiscal_year = report_date.year
                        fiscal_quarter = ((report_date.month - 1) // 3) + 1
                        
                        # Extract financial data from income statement
                        revenue = None
                        net_income = None
                        gross_profit = None
                        operating_income = None
                        
                        if 'Total Revenue' in quarterly_income.index:
                            revenue = self._safe_int(quarterly_income.loc['Total Revenue', date_col])
                        elif 'Revenue' in quarterly_income.index:
                            revenue = self._safe_int(quarterly_income.loc['Revenue', date_col])
                        
                        if 'Net Income' in quarterly_income.index:
                            net_income = self._safe_int(quarterly_income.loc['Net Income', date_col])
                        elif 'Net Income Common Stockholders' in quarterly_income.index:
                            net_income = self._safe_int(quarterly_income.loc['Net Income Common Stockholders', date_col])
                        
                        if 'Gross Profit' in quarterly_income.index:
                            gross_profit = self._safe_int(quarterly_income.loc['Gross Profit', date_col])
                            
                        if 'Operating Income' in quarterly_income.index:
                            operating_income = self._safe_int(quarterly_income.loc['Operating Income', date_col])
                        elif 'EBIT' in quarterly_income.index:
                            operating_income = self._safe_int(quarterly_income.loc['EBIT', date_col])
                        
                        earnings_data.append(EarningsData(
                            symbol=symbol.upper(),
                            fiscal_year=fiscal_year,
                            fiscal_quarter=fiscal_quarter,
                            reported_date=report_date,
                            revenue=revenue,
                            net_income=net_income,
                            gross_profit=gross_profit,
                            operating_income=operating_income,
                        ))
                    except Exception as e:
                        logger.warning(f"Error processing quarterly income statement for {symbol} at {date_col}: {e}")
                        continue
            
            # Get annual income statement (replaces deprecated annual earnings)
            annual_income = ticker.income_stmt
            if annual_income is not None and not annual_income.empty:
                for date_col in annual_income.columns:
                    try:
                        report_date = pd.to_datetime(date_col).date()
                        fiscal_year = report_date.year
                        
                        # Extract financial data from annual income statement
                        revenue = None
                        net_income = None
                        gross_profit = None
                        operating_income = None
                        ebitda = None
                        
                        if 'Total Revenue' in annual_income.index:
                            revenue = self._safe_int(annual_income.loc['Total Revenue', date_col])
                        elif 'Revenue' in annual_income.index:
                            revenue = self._safe_int(annual_income.loc['Revenue', date_col])
                        
                        if 'Net Income' in annual_income.index:
                            net_income = self._safe_int(annual_income.loc['Net Income', date_col])
                        elif 'Net Income Common Stockholders' in annual_income.index:
                            net_income = self._safe_int(annual_income.loc['Net Income Common Stockholders', date_col])
                        
                        if 'Gross Profit' in annual_income.index:
                            gross_profit = self._safe_int(annual_income.loc['Gross Profit', date_col])
                            
                        if 'Operating Income' in annual_income.index:
                            operating_income = self._safe_int(annual_income.loc['Operating Income', date_col])
                        elif 'EBIT' in annual_income.index:
                            operating_income = self._safe_int(annual_income.loc['EBIT', date_col])
                        
                        if 'EBITDA' in annual_income.index:
                            ebitda = self._safe_int(annual_income.loc['EBITDA', date_col])
                        
                        earnings_data.append(EarningsData(
                            symbol=symbol.upper(),
                            fiscal_year=fiscal_year,
                            fiscal_quarter=4,  # Annual data assigned to Q4
                            reported_date=report_date,
                            revenue=revenue,
                            net_income=net_income,
                            gross_profit=gross_profit,
                            operating_income=operating_income,
                            ebitda=ebitda,
                        ))
                    except Exception as e:
                        logger.warning(f"Error processing annual income statement for {symbol} at {date_col}: {e}")
                        continue
            
            # Get EPS data from info
            info = ticker.info
            if info and earnings_data:
                try:
                    current_eps = self._safe_float(info.get('trailingEps'))
                    # Update most recent earnings data with EPS if available
                    if current_eps and earnings_data:
                        earnings_data[-1].eps = current_eps
                except Exception as e:
                    logger.warning(f"Error adding EPS data for {symbol}: {e}")
            
            logger.info(f"Successfully fetched {len(earnings_data)} earnings records for {symbol}")
            return earnings_data
            
        except Exception as e:
            logger.error(f"Error fetching earnings data for {symbol}: {e}")
            return []
    
    def fetch_fundamental_data(self, symbol: str) -> Optional[FundamentalData]:
        """
        Fetch fundamental data for a symbol from yfinance.
        Returns a FundamentalData object or None if data unavailable.
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            
            if not info:
                logger.warning(f"No info data available for {symbol}")
                return None
            
            # Get current year for the fundamental data
            current_year = datetime.now().year
            
            fundamental = FundamentalData(
                symbol=symbol.upper(),
                fiscal_year=current_year,
                fiscal_quarter=None,  # TTM data
                sector=info.get('sector'),
            )
            
            # Valuation ratios
            fundamental.pe_ratio = self._safe_float(info.get('trailingPE'))
            fundamental.pb_ratio = self._safe_float(info.get('priceToBook'))
            fundamental.ps_ratio = self._safe_float(info.get('priceToSalesTrailing12Months'))
            fundamental.dividend_yield = self._safe_float(info.get('dividendYield'))
            
            # Profitability ratios
            fundamental.roe = self._safe_float(info.get('returnOnEquity'))
            fundamental.roa = self._safe_float(info.get('returnOnAssets'))
            fundamental.gross_margin = self._safe_float(info.get('grossMargins'))
            fundamental.operating_margin = self._safe_float(info.get('operatingMargins'))
            fundamental.net_margin = self._safe_float(info.get('profitMargins'))
            
            # Liquidity ratios
            fundamental.current_ratio = self._safe_float(info.get('currentRatio'))
            fundamental.debt_to_equity = self._safe_float(info.get('debtToEquity'))
            
            # Per share metrics
            fundamental.eps = self._safe_float(info.get('trailingEps'))
            fundamental.book_value_per_share = self._safe_float(info.get('bookValue'))
            
            # Market data
            fundamental.market_cap = self._safe_int(info.get('marketCap'))
            fundamental.beta = self._safe_float(info.get('beta'))
            fundamental.shares_outstanding = self._safe_int(info.get('sharesOutstanding'))
            
            logger.info(f"Successfully fetched fundamental data for {symbol}")
            return fundamental
            
        except Exception as e:
            logger.error(f"Error fetching fundamental data for {symbol}: {e}")
            return None
    
    def get_available_symbols(self) -> List[str]:
        """
        Get a list of symbols that have data available.
        This would typically come from your database or a predefined list.
        """
        # This is a placeholder - you would implement this based on your needs
        # Could query your database for symbols that need data updates
        return []
    
    def validate_symbol(self, symbol: str) -> bool:
        """
        Validate if a symbol exists and has data available on Yahoo Finance.
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            return info is not None and len(info) > 1
        except Exception:
            return False
    
    def _safe_float(self, value: Any) -> Optional[float]:
        """Safely convert value to float, return None if conversion fails"""
        if value is None:
            return None
        try:
            if pd.isna(value):
                return None
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _safe_int(self, value: Any) -> Optional[int]:
        """Safely convert value to int, return None if conversion fails"""
        if value is None:
            return None
        try:
            if pd.isna(value):
                return None
            return int(float(value))
        except (ValueError, TypeError):
            return None
    
    def _safe_decimal(self, value: Any, precision: int = 4) -> Optional[Decimal]:
        """Safely convert value to Decimal, return None if conversion fails"""
        if value is None:
            return None
        try:
            if pd.isna(value):
                return None
            return Decimal(str(value)).quantize(Decimal('0.' + '0' * precision))
        except (ValueError, TypeError, AttributeError):
            return None
