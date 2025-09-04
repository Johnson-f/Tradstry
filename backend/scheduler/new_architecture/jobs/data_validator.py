"""
Data validation utilities for ensuring data quality before database storage.
"""

import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class DataValidator:
    """Validates data completeness and quality before database storage."""
    
    @staticmethod
    def validate_stock_quote_data(quote_data: Dict[str, Any]) -> bool:
        """
        Validate stock quote data for completeness.
        
        Args:
            quote_data: Stock quote data dictionary
            
        Returns:
            True if data is valid, False otherwise
        """
        required_fields = ['symbol', 'price']
        critical_fields = ['price', 'volume']
        
        # Check required fields
        for field in required_fields:
            if field not in quote_data or quote_data[field] is None:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Check critical fields for reasonable values
        price = quote_data.get('price')
        if price is not None:
            try:
                price_float = float(price)
                if price_float <= 0:
                    logger.warning(f"Invalid price: {price}")
                    return False
            except (ValueError, TypeError):
                logger.warning(f"Price not numeric: {price}")
                return False
        
        volume = quote_data.get('volume')
        if volume is not None:
            try:
                volume_int = int(volume)
                if volume_int < 0:
                    logger.warning(f"Invalid volume: {volume}")
                    return False
            except (ValueError, TypeError):
                logger.warning(f"Volume not numeric: {volume}")
                return False
        
        return True
    
    @staticmethod
    def validate_company_info_data(company_data: Dict[str, Any]) -> bool:
        """
        Validate company info data for completeness.
        
        Args:
            company_data: Company info data dictionary
            
        Returns:
            True if data is valid, False otherwise
        """
        required_fields = ['symbol']
        important_fields = ['name', 'sector']
        
        # Check required fields
        for field in required_fields:
            if field not in company_data or company_data[field] is None:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Check if we have at least some important fields
        has_important_data = False
        for field in important_fields:
            if company_data.get(field) is not None:
                has_important_data = True
                break
        
        if not has_important_data:
            logger.warning("Company data lacks important fields (name, sector)")
            return False
        
        # Validate market cap if present
        market_cap = company_data.get('market_cap')
        if market_cap is not None:
            try:
                market_cap_int = int(market_cap)
                if market_cap_int < 0:
                    logger.warning(f"Invalid market cap: {market_cap}")
                    return False
            except (ValueError, TypeError):
                # Market cap might be a string like "2.5T", which is acceptable
                pass
        
        return True
    
    @staticmethod
    def validate_fundamental_data(fundamental_data: Dict[str, Any]) -> bool:
        """
        Validate fundamental data for completeness.
        
        Args:
            fundamental_data: Fundamental data dictionary
            
        Returns:
            True if data is valid, False otherwise
        """
        required_fields = ['symbol']
        important_fields = ['revenue', 'net_income', 'total_assets', 'pe_ratio']
        
        # Check required fields
        for field in required_fields:
            if field not in fundamental_data or fundamental_data[field] is None:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Check if we have at least some financial data
        has_financial_data = False
        for field in important_fields:
            if fundamental_data.get(field) is not None:
                has_financial_data = True
                break
        
        if not has_financial_data:
            logger.warning("Fundamental data lacks important financial metrics")
            return False
        
        # Validate numeric fields
        numeric_fields = ['revenue', 'net_income', 'total_assets', 'pe_ratio', 'pb_ratio']
        for field in numeric_fields:
            value = fundamental_data.get(field)
            if value is not None:
                try:
                    float(value)
                except (ValueError, TypeError):
                    logger.warning(f"Non-numeric value for {field}: {value}")
                    # Don't fail validation, just log warning
        
        return True
    
    @staticmethod
    def validate_dividend_data(dividend_data: Dict[str, Any]) -> bool:
        """
        Validate dividend data for completeness.
        
        Args:
            dividend_data: Dividend data dictionary
            
        Returns:
            True if data is valid, False otherwise
        """
        required_fields = ['symbol', 'amount']
        
        # Check required fields
        for field in required_fields:
            if field not in dividend_data or dividend_data[field] is None:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Validate dividend amount
        amount = dividend_data.get('amount')
        if amount is not None:
            try:
                amount_float = float(amount)
                if amount_float < 0:
                    logger.warning(f"Invalid dividend amount: {amount}")
                    return False
            except (ValueError, TypeError):
                logger.warning(f"Dividend amount not numeric: {amount}")
                return False
        
        return True
    
    @staticmethod
    def validate_earnings_data(earnings_data: Dict[str, Any]) -> bool:
        """
        Validate earnings data for completeness.
        
        Args:
            earnings_data: Earnings data dictionary
            
        Returns:
            True if data is valid, False otherwise
        """
        required_fields = ['symbol']
        important_fields = ['eps_actual', 'eps_estimate', 'date']
        
        # Check required fields
        for field in required_fields:
            if field not in earnings_data or earnings_data[field] is None:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Check if we have earnings data
        has_earnings_data = False
        for field in important_fields:
            if earnings_data.get(field) is not None:
                has_earnings_data = True
                break
        
        if not has_earnings_data:
            logger.warning("Earnings data lacks important fields")
            return False
        
        return True
    
    @staticmethod
    def validate_historical_price_data(price_data: Dict[str, Any]) -> bool:
        """
        Validate historical price data for completeness.
        
        Args:
            price_data: Historical price data dictionary
            
        Returns:
            True if data is valid, False otherwise
        """
        required_fields = ['symbol', 'date']
        price_fields = ['open', 'high', 'low', 'close']
        
        # Check required fields
        for field in required_fields:
            if field not in price_data or price_data[field] is None:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Check if we have price data
        has_price_data = False
        for field in price_fields:
            if price_data.get(field) is not None:
                has_price_data = True
                break
        
        if not has_price_data:
            logger.warning("Historical price data lacks OHLC data")
            return False
        
        # Validate price values
        for field in price_fields:
            value = price_data.get(field)
            if value is not None:
                try:
                    price_float = float(value)
                    if price_float <= 0:
                        logger.warning(f"Invalid {field} price: {value}")
                        return False
                except (ValueError, TypeError):
                    logger.warning(f"{field} price not numeric: {value}")
                    return False
        
        return True
