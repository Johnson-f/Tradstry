"""
Company info database service.
Handles database operations specifically for company information data.
"""

import logging
from typing import List, Dict
from supabase import Client
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class CompanyInfoDB:
    """Database service for company info operations."""
    
    def __init__(self, supabase_client: Client = None):
        """Initialize with Supabase client."""
        self.supabase = supabase_client or get_supabase_admin_client()
    
    async def upsert_company_info(self, companies_data: List[Dict]) -> bool:
        """Store company info in database using upsert function."""
        try:
            for company in companies_data:
                params = {
                    'p_symbol': company.get('symbol'),
                    'p_data_provider': company.get('provider', 'market_data_brain'),
                    'p_name': company.get('name'),
                    'p_company_name': company.get('name'),  # Some providers use different field names
                    'p_sector': company.get('sector'),
                    'p_industry': company.get('industry'),
                    'p_market_cap': company.get('market_cap'),
                    'p_employees': company.get('employees'),
                    'p_description': company.get('description'),
                    'p_website': company.get('website'),
                    'p_ceo': company.get('ceo')
                }
                
                response = self.supabase.rpc('upsert_company_info', params).execute()
                if hasattr(response, 'error') and response.error:
                    logger.error(f"Error upserting company info for {company.get('symbol')}: {response.error}")
                    return False
            
            logger.info(f"Successfully stored {len(companies_data)} company info records")
            return True
            
        except Exception as e:
            logger.error(f"Error storing company info: {e}")
            return False
    
    async def get_company_info(self, symbols: List[str]) -> List[Dict]:
        """Get company info for given symbols."""
        try:
            response = self.supabase.table('company_info')\
                .select('*')\
                .in_('symbol', symbols)\
                .execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching company info: {e}")
            return []
    
    async def close(self):
        """Close database connections."""
        try:
            logger.info("Company info DB service closed")
        except Exception as e:
            logger.error(f"Error closing company info DB service: {e}")
