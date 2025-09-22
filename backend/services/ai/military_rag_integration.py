"""
Military AI + RAG Integration
Integrates the military-style AI system with the RAG (Retrieval-Augmented Generation) system
to provide contextual, factual responses based on historical trading data
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from .rag_vector_service import RAGVectorService
from .rag_retriever_service import RAGRetrieverService
from .ai_response_validator import military_validator, ValidationResult
from .ai_personality_config import MILITARY_FORMATTER

logger = logging.getLogger(__name__)

class MilitaryRAGIntegration:
    """
    Integrates military-style AI with RAG system for contextual factual responses
    Ensures all RAG-retrieved content meets military standards before use
    """
    
    def __init__(self, vector_service: RAGVectorService, retriever_service: RAGRetrieverService):
        """Initialize military RAG integration"""
        self.vector_service = vector_service
        self.retriever_service = retriever_service
        self.military_mode = True
        logger.info("🎖️  Military RAG Integration initialized - factual context only")
    
    async def get_military_context(
        self, 
        user_token: str, 
        query: str, 
        max_context_items: int = 5
    ) -> Dict[str, Any]:
        """
        Retrieve factual context from RAG system that meets military standards
        Filters out any speculative or predictive content
        """
        logger.info(f"🔍 Retrieving military-compliant context for query: {query[:50]}...")
        
        try:
            # Get raw context from RAG system
            raw_context = await self.retriever_service.get_contextual_documents(
                user_token=user_token,
                query=query,
                content_types=['trade_data', 'stock_trade', 'options_trade', 'trading_note'],
                max_documents=max_context_items * 2  # Get extra to filter down
            )
            
            # Filter context for military compliance
            military_context = []
            for context_item in raw_context:
                content = context_item.get('content', '')
                
                # Validate content meets military standards
                validation = military_validator.validate_response(content, "context")
                
                if validation.passes_validation:
                    # Use original content if compliant
                    military_context.append({
                        **context_item,
                        'military_validated': True,
                        'validation_score': validation.overall_score
                    })
                elif validation.cleaned_response:
                    # Use cleaned version if auto-correction possible
                    military_context.append({
                        **context_item,
                        'content': validation.cleaned_response,
                        'military_validated': True,
                        'validation_score': validation.overall_score,
                        'auto_corrected': True
                    })
                else:
                    # Create factual summary if content can't be cleaned
                    factual_summary = self._create_factual_summary(context_item)
                    military_context.append({
                        **context_item,
                        'content': factual_summary,
                        'military_validated': False,
                        'validation_score': 0.0,
                        'factual_summary': True
                    })
                
                # Limit to requested number
                if len(military_context) >= max_context_items:
                    break
            
            # Create military-style context summary
            context_summary = self._format_military_context(military_context, query)
            
            logger.info(f"✅ Retrieved {len(military_context)} military-compliant context items")
            
            return {
                'context_items': military_context,
                'context_summary': context_summary,
                'total_items': len(military_context),
                'military_compliant': True,
                'query': query
            }
            
        except Exception as e:
            logger.error(f"❌ Military context retrieval failed: {str(e)}")
            return {
                'context_items': [],
                'context_summary': "CONTEXT RETRIEVAL: Data insufficient for analysis",
                'total_items': 0,
                'military_compliant': False,
                'error': str(e)
            }
    
    async def get_symbol_specific_context(
        self, 
        user_token: str, 
        symbol: str,
        analysis_type: str = "historical"
    ) -> Dict[str, Any]:
        """
        Get military-compliant symbol-specific context
        Provides factual historical data for the specified symbol
        """
        logger.info(f"📊 Retrieving military context for symbol: {symbol}")
        
        try:
            # Get symbol-specific context from RAG
            raw_context = await self.retriever_service.get_trade_specific_context(
                user_token=user_token,
                symbol=symbol,
                content_types=['stock_trade', 'options_trade', 'trading_note']
            )
            
            # Process for military compliance
            symbol_data = []
            total_pnl = 0.0
            trade_count = 0
            
            for item in raw_context:
                # Extract factual metrics
                metadata = item.get('metadata', {})
                
                # Accumulate factual data
                if 'pnl' in metadata:
                    try:
                        pnl = float(metadata['pnl'])
                        total_pnl += pnl
                        trade_count += 1
                    except:
                        pass
                
                # Validate content
                content = item.get('content', '')
                validation = military_validator.validate_response(content, "analysis")
                
                if validation.passes_validation or validation.cleaned_response:
                    final_content = validation.cleaned_response or content
                    symbol_data.append({
                        'content': final_content,
                        'metadata': metadata,
                        'military_validated': True,
                        'date': metadata.get('trade_date'),
                        'pnl': metadata.get('pnl')
                    })
            
            # Create military-style symbol summary
            symbol_summary = self._format_symbol_analysis(symbol, symbol_data, total_pnl, trade_count)
            
            logger.info(f"✅ Retrieved {len(symbol_data)} factual records for {symbol}")
            
            return {
                'symbol': symbol,
                'trade_data': symbol_data,
                'summary': symbol_summary,
                'metrics': {
                    'total_trades': trade_count,
                    'total_pnl': total_pnl,
                    'avg_pnl': total_pnl / trade_count if trade_count > 0 else 0.0
                },
                'military_compliant': True
            }
            
        except Exception as e:
            logger.error(f"❌ Symbol context retrieval failed for {symbol}: {str(e)}")
            return {
                'symbol': symbol,
                'trade_data': [],
                'summary': f"DATA ANALYSIS: Insufficient historical data for {symbol}",
                'metrics': {'total_trades': 0, 'total_pnl': 0.0, 'avg_pnl': 0.0},
                'military_compliant': False,
                'error': str(e)
            }
    
    def _create_factual_summary(self, context_item: Dict[str, Any]) -> str:
        """Create factual summary when original content fails validation"""
        metadata = context_item.get('metadata', {})
        
        # Extract factual elements
        factual_elements = []
        
        if 'symbol' in metadata:
            factual_elements.append(f"Symbol: {metadata['symbol']}")
        
        if 'trade_date' in metadata:
            factual_elements.append(f"Date: {metadata['trade_date']}")
        
        if 'pnl' in metadata:
            factual_elements.append(f"P&L: ${metadata['pnl']}")
        
        if 'action' in metadata:
            factual_elements.append(f"Action: {metadata['action']}")
        
        if factual_elements:
            return f"TRADE DATA: {' | '.join(factual_elements)}"
        else:
            return "TRADE DATA: Factual information available in metadata only"
    
    def _format_military_context(self, context_items: List[Dict[str, Any]], query: str) -> str:
        """Format context items in military-style summary"""
        if not context_items:
            return "CONTEXT ANALYSIS: No relevant historical data found for query"
        
        summary_parts = []
        summary_parts.append(f"CONTEXT INTELLIGENCE FOR: {query}")
        summary_parts.append("")
        summary_parts.append(f"RELEVANT RECORDS FOUND: {len(context_items)}")
        summary_parts.append("")
        
        for i, item in enumerate(context_items[:3], 1):  # Show top 3
            metadata = item.get('metadata', {})
            content_preview = item.get('content', '')[:100] + "..." if len(item.get('content', '')) > 100 else item.get('content', '')
            
            summary_parts.append(f"RECORD {i}:")
            if 'symbol' in metadata:
                summary_parts.append(f"  Symbol: {metadata['symbol']}")
            if 'trade_date' in metadata:
                summary_parts.append(f"  Date: {metadata['trade_date']}")
            if 'pnl' in metadata:
                summary_parts.append(f"  P&L: ${metadata['pnl']}")
            summary_parts.append(f"  Data: {content_preview}")
            summary_parts.append("")
        
        if len(context_items) > 3:
            summary_parts.append(f"ADDITIONAL RECORDS: {len(context_items) - 3} more available")
        
        summary_parts.append("NOTE: All context data verified for factual accuracy")
        
        return "\n".join(summary_parts)
    
    def _format_symbol_analysis(self, symbol: str, data: List[Dict], total_pnl: float, trade_count: int) -> str:
        """Format symbol-specific analysis in military style"""
        analysis_parts = []
        analysis_parts.append(f"SYMBOL ANALYSIS: {symbol}")
        analysis_parts.append("")
        analysis_parts.append("HISTORICAL PERFORMANCE:")
        analysis_parts.append(f"  Total Trades: {trade_count}")
        analysis_parts.append(f"  Total P&L: ${total_pnl:.2f}")
        
        if trade_count > 0:
            avg_pnl = total_pnl / trade_count
            analysis_parts.append(f"  Average P&L: ${avg_pnl:.2f}")
            
            # Calculate win rate if possible
            profitable_trades = len([d for d in data if d.get('pnl', 0) > 0])
            if trade_count > 0:
                win_rate = (profitable_trades / trade_count) * 100
                analysis_parts.append(f"  Win Rate: {win_rate:.1f}% ({profitable_trades}/{trade_count})")
        
        analysis_parts.append("")
        analysis_parts.append("DATA PERIOD: Based on available historical records")
        analysis_parts.append("LIMITATION: Analysis limited to recorded trade data")
        
        return "\n".join(analysis_parts)
    
    async def index_military_compliant_content(
        self, 
        user_token: str, 
        content: str, 
        content_type: str,
        metadata: Dict[str, Any] = None
    ) -> Optional[str]:
        """
        Index content only if it meets military standards
        Validates content before adding to RAG system
        """
        logger.info(f"🔍 Validating content for military compliance before indexing")
        
        # Validate content first
        validation = military_validator.validate_response(content, content_type)
        
        if validation.passes_validation:
            # Content meets standards - index as-is
            try:
                from .rag_vector_service import DocumentType
                
                # Map content type to DocumentType
                doc_type_mapping = {
                    'trade_data': DocumentType.TRADE_DATA,
                    'stock_trade': DocumentType.STOCK_TRADE,
                    'options_trade': DocumentType.OPTIONS_TRADE,
                    'trading_note': DocumentType.TRADING_NOTE,
                    'ai_report': DocumentType.AI_REPORT
                }
                
                doc_type = doc_type_mapping.get(content_type, DocumentType.TRADE_DATA)
                
                doc_id = await self.vector_service.index_document(
                    user_token=user_token,
                    doc_type=doc_type,
                    title=f"Military Validated {content_type}",
                    content=content,
                    metadata=metadata or {}
                )
                
                logger.info(f"✅ Military-compliant content indexed: {doc_id}")
                return doc_id
                
            except Exception as e:
                logger.error(f"❌ Failed to index military content: {str(e)}")
                return None
        
        elif validation.cleaned_response:
            # Content can be auto-corrected
            logger.info(f"🔧 Auto-correcting content before indexing")
            return await self.index_military_compliant_content(
                user_token, validation.cleaned_response, content_type, metadata
            )
        
        else:
            # Content fails validation - don't index
            logger.warning(f"⚠️  Content failed military validation - not indexed")
            logger.warning(f"Issues: {[issue.description for issue in validation.issues]}")
            return None
    
    def enable_military_mode(self, enabled: bool = True):
        """Enable or disable military mode for RAG integration"""
        self.military_mode = enabled
        logger.info(f"🎖️  Military RAG mode {'ENABLED' if enabled else 'DISABLED'}")
    
    def get_integration_stats(self) -> Dict[str, Any]:
        """Get statistics about military RAG integration"""
        return {
            'military_mode_enabled': self.military_mode,
            'validator_stats': military_validator.get_validation_stats(),
            'integration_active': True
        }
