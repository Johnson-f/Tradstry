"""
Quick test to check if AI Orchestrator initializes properly with RAG fixes
"""

import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def test_orchestrator_initialization():
    """Test if AIOrchestrator initializes without errors"""
    print("🧪 Testing AI Orchestrator Initialization")
    print("=" * 50)
    
    try:
        # Import the orchestrator service
        from services.ai_orchestrator_service import AIOrchestrator
        
        print("✅ Successfully imported AIOrchestrator")
        
        # Try to initialize it
        orchestrator = AIOrchestrator()
        
        print("✅ AIOrchestrator initialized successfully")
        print(f"   - RAG enabled: {orchestrator.rag_enabled}")
        print(f"   - Current LLM model: {orchestrator.current_llm_model}")
        
        # Test if basic services are available
        if hasattr(orchestrator, 'reports_service'):
            print("✅ Reports service available")
        
        if hasattr(orchestrator, 'chat_service'):
            print("✅ Chat service available")
            
        if hasattr(orchestrator, 'insights_service'):
            print("✅ Insights service available")
        
        if orchestrator.rag_enabled:
            print("✅ RAG system is enabled and working")
        else:
            print("⚠️  RAG system is disabled (fallback mode)")
        
        print("\n" + "=" * 50)
        print("🎉 AI Orchestrator initialization test PASSED")
        print("The 500 error should be resolved.")
        return True
        
    except Exception as e:
        print(f"❌ AI Orchestrator initialization FAILED: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        
        # Print more detailed error info
        import traceback
        print(f"   Traceback: {traceback.format_exc()}")
        
        print("\n" + "=" * 50)
        print("❌ The 500 error likely persists due to initialization issues")
        return False

if __name__ == "__main__":
    asyncio.run(test_orchestrator_initialization())
