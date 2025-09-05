"""
Fundamental data database service.
Handles database operations specifically for fundamental data.
"""

import logging
from typing import List, Dict
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class FundamentalDataDB:
    """Database service for fundamental data operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_fundamental_data(self, fundamentals_data: List[Dict]) -> bool:
        """Store fundamental data in database using upsert function."""
        try:
            for fundamental in fundamentals_data:
                params = {
                    # Required parameters
                    'p_symbol': fundamental.get('symbol'),
                    'p_fiscal_year': fundamental.get('fiscal_year'),
                    'p_fiscal_quarter': fundamental.get('fiscal_quarter'),
                    'p_data_provider': fundamental.get('data_provider', 'market_data_brain'),
                    
                    # Exchange parameters
                    'p_exchange_code': fundamental.get('exchange_code'),
                    'p_exchange_name': fundamental.get('exchange_name'),
                    'p_exchange_country': fundamental.get('exchange_country'),
                    'p_exchange_timezone': fundamental.get('exchange_timezone'),
                    
                    # Fundamental data parameters
                    'p_sector': fundamental.get('sector'),
                    'p_pe_ratio': fundamental.get('pe_ratio'),
                    'p_pb_ratio': fundamental.get('pb_ratio'),
                    'p_ps_ratio': fundamental.get('ps_ratio'),
                    'p_pegr_ratio': fundamental.get('pegr_ratio'),
                    'p_dividend_yield': fundamental.get('dividend_yield'),
                    'p_roe': fundamental.get('roe'),
                    'p_roa': fundamental.get('roa'),
                    'p_roic': fundamental.get('roic'),
                    'p_gross_margin': fundamental.get('gross_margin'),
                    'p_operating_margin': fundamental.get('operating_margin'),
                    'p_net_margin': fundamental.get('net_margin'),
                    'p_ebitda_margin': fundamental.get('ebitda_margin'),
                    'p_current_ratio': fundamental.get('current_ratio'),
                    'p_quick_ratio': fundamental.get('quick_ratio'),
                    'p_debt_to_equity': fundamental.get('debt_to_equity'),
                    'p_debt_to_assets': fundamental.get('debt_to_assets'),
                    'p_interest_coverage': fundamental.get('interest_coverage'),
                    'p_asset_turnover': fundamental.get('asset_turnover'),
                    'p_inventory_turnover': fundamental.get('inventory_turnover'),
                    'p_receivables_turnover': fundamental.get('receivables_turnover'),
                    'p_payables_turnover': fundamental.get('payables_turnover'),
                    'p_revenue_growth': fundamental.get('revenue_growth'),
                    'p_earnings_growth': fundamental.get('earnings_growth'),
                    'p_book_value_growth': fundamental.get('book_value_growth'),
                    'p_dividend_growth': fundamental.get('dividend_growth'),
                    'p_eps': fundamental.get('eps'),
                    'p_book_value_per_share': fundamental.get('book_value_per_share'),
                    'p_revenue_per_share': fundamental.get('revenue_per_share'),
                    'p_cash_flow_per_share': fundamental.get('cash_flow_per_share'),
                    'p_dividend_per_share': fundamental.get('dividend_per_share'),
                    'p_market_cap': fundamental.get('market_cap'),
                    'p_enterprise_value': fundamental.get('enterprise_value'),
                    'p_beta': fundamental.get('beta'),
                    'p_shares_outstanding': fundamental.get('shares_outstanding'),
                    'p_period_end_date': fundamental.get('period_end_date'),
                    'p_report_type': fundamental.get('report_type', 'quarterly')
                }
                
                response = self.supabase.rpc('upsert_fundamental_data', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting fundamental data for {fundamental.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(fundamentals_data)} fundamental data records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing fundamental data: {e}")
            return False
    
    async def get_fundamental_data(self, symbols: List[str]) -> List[Dict]:
        """Get fundamental data for given symbols."""
        try:
            response = self.supabase.table('fundamental_data')\
                .select('*')\
                .in_('symbol', symbols)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching fundamental data: {e}")
            return []
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Fundamental data DB service closed")
        except Exception as e:
            logger.error(f"Error closing fundamental data DB service: {e}")
