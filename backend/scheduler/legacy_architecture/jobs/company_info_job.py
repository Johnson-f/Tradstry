"""
Company information data processing job.
Processes and stores company profile and basic information data.
Note: In the new architecture, data fetching is handled by CronDataScheduler.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

from scheduler.jobs.base_job import BaseMarketDataJob
from market_data.brain import MarketDataBrain
from scheduler.data_fetch_tracker import DataType, DataFetchTracker
from scheduler.enhanced_provider_manager import EnhancedProviderManager, FetchStrategy


logger = logging.getLogger(__name__)


class CompanyInfoJob(BaseMarketDataJob):
    """Job for processing and storing company information."""
    
    def __init__(
        self, 
        database_service,
        data_tracker: DataFetchTracker = None,
        provider_manager: EnhancedProviderManager = None
    ):
        """Initialize with database service."""
        super().__init__(database_service, data_tracker, provider_manager)
    
    def _get_data_type(self) -> DataType:
        """Get the data type for this job."""
        return DataType.COMPANY_INFO
    
    async def process_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process raw company information data for storage."""
        try:
            logger.info(f"Processing company info for {len(raw_data)} symbols")
            
            processed_data = {}
            
            for symbol, company_info in raw_data.items():
                # Transform the data for storage
                processed_info = await self._transform_for_storage(company_info)
                
                # Add metadata
                processed_info['symbol'] = symbol
                processed_info['updated_at'] = datetime.now().isoformat()
                processed_info['data_source'] = 'market_data_brain'
                
                # Validate required fields
                if self._validate_company_info(processed_info):
                    processed_data[symbol] = processed_info
                else:
                    logger.warning(f"Invalid company info for {symbol}, skipping")
            
            logger.info(f"Successfully processed {len(processed_data)} company records")
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing company info data: {e}")
            return {}
    
    async def store_data(self, data: Dict[str, Any]) -> bool:
        """Store processed company information data using database upsert function."""
        if not data:
            logger.warning("No company info data to store")
            return True
        
        try:
            logger.info(f"Storing company info for {len(data)} symbols")
            
            # Convert to list format for database upsert
            company_records = list(data.values())
                        "p_symbol": symbol,
                        "p_data_provider": fetch_result.provider,
                        
                        # Exchange parameters for automatic exchange handling
                        "p_exchange_code": exchange_code,
                        "p_exchange_name": exchange_name,
                        "p_exchange_country": exchange_country or getattr(info, 'country', None),
                        "p_exchange_timezone": exchange_timezone,
                        
                        # Company basic info parameters
                        "p_name": getattr(info, 'name', None),
                        "p_company_name": getattr(info, 'company_name', None) or getattr(info, 'name', None),
                        "p_exchange": exchange_value if isinstance(exchange_value, str) else exchange_code,
                        "p_sector": getattr(info, 'sector', None),
                        "p_industry": getattr(info, 'industry', None),
                        
                        # Financial metrics - convert to appropriate types
                        "p_market_cap": safe_convert(getattr(info, 'market_cap', None), int),
                        "p_employees": safe_convert(getattr(info, 'employees', None), int),
                        "p_revenue": safe_convert(getattr(info, 'revenue', None), int),
                        "p_net_income": safe_convert(getattr(info, 'net_income', None), int),
                        "p_pe_ratio": safe_convert(getattr(info, 'pe_ratio', None), float),
                        "p_pb_ratio": safe_convert(getattr(info, 'pb_ratio', None), float),
                        "p_dividend_yield": safe_convert(getattr(info, 'dividend_yield', None), float),
                        
                        # Company details
                        "p_description": getattr(info, 'description', None),
                        "p_website": getattr(info, 'website', None),
                        "p_ceo": getattr(info, 'ceo', None),
                        "p_headquarters": getattr(info, 'headquarters', None),
                        "p_founded": getattr(info, 'founded', None),
                        "p_phone": getattr(info, 'phone', None),
                        "p_email": getattr(info, 'email', None),
                        
                        # Date and other fields
                        "p_ipo_date": getattr(info, 'ipo_date', None),
                        "p_currency": getattr(info, 'currency', None) or 'USD',
                        "p_fiscal_year_end": getattr(info, 'fiscal_year_end', None)
                    }
                    
                    # Log comprehensive data being stored
                    non_null_fields = []
                    critical_fields = []
                    for k, v in params.items():
                        if v is not None and k.startswith('p_'):
                            field_name = k.replace('p_', '')
                            non_null_fields.append(field_name)
                            if field_name in ['revenue', 'net_income', 'pb_ratio', 'ceo', 'ipo_date']:
                                critical_fields.append(f"{field_name}={v}")
                    
                    logger.info(f"Storing {symbol}: {len(non_null_fields)} total fields populated")
                    if critical_fields:
                        logger.info(f"Critical fields for {symbol}: {critical_fields}")
                    
                    # Execute the upsert function
                    result = await self.db_service.execute_function("upsert_company_info", **params)
                    
                    if result is not None:
                        success_count += 1
                        logger.info(f"✅ Successfully stored comprehensive data for {symbol} (ID: {result})")
                        logger.info(f"   Provider(s): {fetch_result.provider}")
                        logger.info(f"   Fields stored: {len(non_null_fields)}")
                    else:
                        logger.error(f"❌ Failed to store company info for {symbol}: function returned None")
                    
                except Exception as e:
                    logger.error(f"Failed to store company info for {symbol}: {e}")
                    logger.error(f"Data for {symbol}: {getattr(fetch_result, 'data', 'No data')}")
            
            logger.info(f"📊 Storage Summary: {success_count}/{valid_data_count} comprehensive records stored successfully")
            
            # Return True if we successfully stored all valid data
            return success_count > 0 and success_count == valid_data_count
            
        except Exception as e:
            logger.error(f"Error storing comprehensive company info: {e}")
            return False
    
    async def _fetch_with_field_fallback(self, symbol: str) -> Optional[Any]:
        """Fetch company info by aggregating data from ALL providers for comprehensive coverage."""
        try:
            # Quick validation for obviously invalid symbols
            if not symbol or len(symbol) > 10 or not symbol.replace('.', '').isalnum():
                logger.warning(f"Invalid symbol format: {symbol}")
                return None
                
            # Get list of available providers from the brain
            available_providers = self.orchestrator.get_available_providers()
            if not available_providers:
                logger.warning("No providers available for comprehensive data aggregation")
                return None
            
            logger.info(f"Starting comprehensive data aggregation for {symbol} across {len(available_providers)} providers")
            
            # Comprehensive field mapping - all possible fields we want to collect
            comprehensive_fields = {
                # Basic company info
                'name': None, 'company_name': None, 'description': None, 'sector': None, 'industry': None,
                'exchange': None, 'website': None, 'ceo': None, 'headquarters': None, 'founded': None,
                'country': None, 'state': None, 'city': None, 'phone': None, 'address': None,
                
                # Financial metrics
                'market_cap': None, 'pe_ratio': None, 'pb_ratio': None, 'peg_ratio': None, 'eps': None,
                'revenue': None, 'net_income': None, 'dividend_yield': None, 'dividend_per_share': None,
                'profit_margin': None, 'roe': None, 'roa': None, 'beta': None,
                
                # Additional info
                'employees': None, 'ipo_date': None, 'currency': None, 'logo_url': None
            }
            
            # Collect data from ALL providers (not just first successful one)
            provider_contributions = {}
            base_company_info = None
            base_provider = None
            
            # Query ALL available providers to get comprehensive data
            for provider_name in available_providers:
                try:
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        
                        logger.info(f"Querying {provider_name} for {symbol}")
                        company_info = await provider.get_company_info(symbol)
                        
                        if company_info is not None:
                            provider_contributions[provider_name] = company_info
                            
                            # Use first successful result as base structure
                            if base_company_info is None:
                                base_company_info = company_info
                                base_provider = provider_name
                                logger.info(f"Using {provider_name} as base structure for {symbol}")
                            
                            # Collect all available fields from this provider
                            fields_found = []
                            for field_name in comprehensive_fields:
                                field_value = getattr(company_info, field_name, None)
                                if field_value is not None and field_value != '' and field_value != 0:
                                    # Only update if we don't have this field yet (first provider wins for each field)
                                    if comprehensive_fields[field_name] is None:
                                        comprehensive_fields[field_name] = {
                                            'value': field_value,
                                            'provider': provider_name
                                        }
                                        fields_found.append(field_name)
                            
                            if fields_found:
                                logger.info(f"{provider_name} contributed {len(fields_found)} fields: {fields_found[:5]}{'...' if len(fields_found) > 5 else ''}")
                        else:
                            logger.debug(f"No data from {provider_name} for {symbol}")
                    
                    # Small delay between provider attempts to respect rate limits
                    await asyncio.sleep(0.02)
                    
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed for {symbol}: {e}")
                    continue
            
            if base_company_info is None:
                logger.warning(f"No providers returned valid data for {symbol}")
                return None
            
            # Create comprehensive merged result
            enhanced_data = await self._create_comprehensive_company_info(
                base_company_info, comprehensive_fields, symbol, provider_contributions
            )
            
            # Create result with all contributing providers listed
            contributing_providers = list(provider_contributions.keys())
            provider_string = f"{base_provider}+{'+'.join([p for p in contributing_providers if p != base_provider])}"
            
            from market_data.brain import FetchResult
            comprehensive_result = FetchResult(
                data=enhanced_data,
                provider=provider_string,
                success=True
            )
            
            # Log comprehensive aggregation summary
            populated_fields = [field for field, data in comprehensive_fields.items() if data is not None]
            provider_summary = {}
            for field, data in comprehensive_fields.items():
                if data is not None:
                    provider = data['provider']
                    if provider not in provider_summary:
                        provider_summary[provider] = 0
                    provider_summary[provider] += 1
            
            logger.info(f"Comprehensive aggregation for {symbol}: {len(populated_fields)} fields from {len(contributing_providers)} providers")
            logger.info(f"Provider contributions: {provider_summary}")
            
            return comprehensive_result
            
        except Exception as e:
            logger.error(f"Error in comprehensive data aggregation for {symbol}: {e}")
            return None
    
    async def _create_comprehensive_company_info(self, base_info, comprehensive_fields: Dict, symbol: str, provider_contributions: Dict):
        """Create a comprehensive CompanyInfo object by merging data from all providers."""
        try:
            from market_data.base import CompanyInfo
            
            # Build comprehensive data dictionary
            merged_data = {
                'symbol': symbol,
                'provider': f"comprehensive_aggregation"
            }
            
            # Merge all fields from comprehensive_fields
            for field_name, field_data in comprehensive_fields.items():
                if field_data is not None:
                    merged_data[field_name] = field_data['value']
                    logger.debug(f"Set {field_name} for {symbol} from {field_data['provider']}: {field_data['value']}")
                else:
                    # Try to get from base_info if not found in any provider
                    base_value = getattr(base_info, field_name, None)
                    if base_value is not None:
                        merged_data[field_name] = base_value
            
            # Ensure required fields are present
            if 'name' not in merged_data or not merged_data['name']:
                merged_data['name'] = merged_data.get('company_name', symbol)
            
            # Create new comprehensive CompanyInfo object
            comprehensive_info = CompanyInfo(**merged_data)
            
            logger.info(f"Created comprehensive company info for {symbol} with {len([k for k, v in merged_data.items() if v is not None])} populated fields")
            
            return comprehensive_info
            
        except Exception as e:
            logger.error(f"Error creating comprehensive company info for {symbol}: {e}")
            # Fallback to original merge method
            return await self._merge_company_info_fields_legacy(base_info, comprehensive_fields, symbol)
    
    async def _merge_company_info_fields_legacy(self, base_info, fields_dict: Dict, symbol: str):
        """Legacy merge method as fallback."""
        try:
            enhanced_info = base_info
            
            for field_name, field_data in fields_dict.items():
                if field_data is not None:
                    current_value = getattr(enhanced_info, field_name, None)
                    if current_value is None:
                        setattr(enhanced_info, field_name, field_data['value'])
                        logger.debug(f"Set {field_name} for {symbol} from {field_data['provider']}")
            
            return enhanced_info
            
        except Exception as e:
            logger.error(f"Error in legacy merge for {symbol}: {e}")
            return base_info
    
    async def _validate_and_store_with_fallback(self, symbol: str, fetch_result) -> bool:
        """Validate data and store with field-level fallback for missing critical fields."""
        try:
            if not fetch_result.success or not fetch_result.data:
                return False
            
            company_info = fetch_result.data
            
            # Check for missing critical fields
            critical_fields = ['pe_ratio', 'pb_ratio', 'dividend_yield', 'market_cap']
            missing_fields = []
            
            for field in critical_fields:
                field_value = getattr(company_info, field, None)
                if field_value is None:
                    missing_fields.append(field)
            
            # If we have missing critical fields, try to get them from other providers
            if missing_fields:
                logger.info(f"Attempting to fill missing fields {missing_fields} for {symbol}")
                additional_data = await self._get_missing_fields_from_providers(
                    symbol, missing_fields
                )
                
                # Merge the additional data
                for field, data in additional_data.items():
                    if data is not None:
                        setattr(company_info, field, data['value'])
                        logger.info(f"Filled {field} for {symbol} from {data['provider']}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error in validate and store with fallback for {symbol}: {e}")
            return False
    
    async def _get_missing_fields_from_providers(self, symbol: str, missing_fields: List[str]) -> Dict[str, Any]:
        """Get missing fields from alternative providers."""
        field_values = {}
        
        try:
            # Get available providers
            available_providers = self.orchestrator.get_available_providers()
            
            for provider_name in available_providers:
                if not missing_fields:  # All fields found
                    break
                
                try:
                    # Get the provider instance directly
                    if provider_name in self.orchestrator.providers:
                        provider = self.orchestrator.providers[provider_name]
                        company_info = await provider.get_company_info(symbol)
                        
                        if company_info is not None:
                            # Check for missing fields in this provider's data
                            for field in missing_fields.copy():
                                field_value = getattr(company_info, field, None)
                                if field_value is not None:
                                    field_values[field] = {
                                        'value': field_value,
                                        'provider': provider_name
                                    }
                                    missing_fields.remove(field)
                                    logger.info(f"Found missing {field} from {provider_name} for {symbol}")
                    
                    await asyncio.sleep(0.01)  # Further reduced for faster tests
                
                except Exception as e:
                    logger.warning(f"Failed to check {provider_name} for missing fields: {e}")
                    continue
            
            # Log any fields that couldn't be found
            if missing_fields:
                logger.warning(f"Could not find data for fields {missing_fields} for {symbol} from any provider")
            
            return field_values
            
        except Exception as e:
            logger.error(f"Error getting missing fields for {symbol}: {e}")
            return {}
