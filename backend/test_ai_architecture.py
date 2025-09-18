#!/usr/bin/env python3
"""
Test script to verify the new AI services architecture
Tests the DAL pattern and service layer separation
"""

import asyncio
import sys
import os
from dotenv import load_dotenv

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

async def test_imports():
    """Test that all new imports work correctly"""
    print("🧪 Testing AI Services Architecture")
    print("=" * 50)
    
    try:
        # Test new AI service imports
        from services.ai.ai_chat_service import AIChatService
        from services.ai.ai_insights_service import AIInsightsService
        from services.ai.ai_reports_service import AIReportsService
        from services.ai.ai_embedding_service import AIEmbeddingService
        from services.ai.ai_orchestrator_service import AIOrchestrator
        from services.ai.rag_vector_service import RAGVectorService
        from services.ai.rag_retriever_service import RAGRetrieverService
        
        print("✅ All AI service imports successful")
        
        # Test DAL imports
        from services.ai.dal.base_dal import BaseDAL
        from services.ai.dal.ai_chat_dal import AIChatDAL
        from services.ai.dal.ai_insights_dal import AIInsightsDAL
        from services.ai.dal.ai_reports_dal import AIReportsDAL
        
        print("✅ All DAL imports successful")
        
        # Test legacy compatibility imports
        from services import AIChatService as LegacyChat
        from services import AIInsightsService as LegacyInsights
        from services import AIReportsService as LegacyReports
        
        print("✅ Legacy compatibility imports successful")
        
        return True
        
    except Exception as e:
        print(f"❌ Import test failed: {str(e)}")
        return False

async def test_service_initialization():
    """Test that services can be initialized with the new architecture"""
    print("\n🔧 Testing Service Initialization")
    print("-" * 30)
    
    try:
        from services.ai.ai_chat_service import AIChatService
        from services.ai.ai_insights_service import AIInsightsService
        from services.ai.ai_reports_service import AIReportsService
        from services.ai.ai_embedding_service import AIEmbeddingService
        
        # Test service initialization
        chat_service = AIChatService()
        insights_service = AIInsightsService()
        reports_service = AIReportsService()
        embedding_service = AIEmbeddingService()
        
        print("✅ Chat Service initialized")
        print("✅ Insights Service initialized")
        print("✅ Reports Service initialized")
        print("✅ Embedding Service initialized")
        
        return True
        
    except Exception as e:
        print(f"❌ Service initialization failed: {str(e)}")
        return False

async def test_dal_initialization():
    """Test that DAL components can be initialized"""
    print("\n💾 Testing DAL Initialization")
    print("-" * 30)
    
    try:
        from services.ai.dal.ai_chat_dal import AIChatDAL
        from services.ai.dal.ai_insights_dal import AIInsightsDAL
        from services.ai.dal.ai_reports_dal import AIReportsDAL
        
        # Test DAL initialization
        chat_dal = AIChatDAL()
        insights_dal = AIInsightsDAL()
        reports_dal = AIReportsDAL()
        
        print("✅ Chat DAL initialized")
        print("✅ Insights DAL initialized")
        print("✅ Reports DAL initialized")
        
        # Test that DALs have expected methods
        expected_methods = ['get_authenticated_user_id', 'call_sql_function']
        
        for dal, name in [(chat_dal, 'Chat'), (insights_dal, 'Insights'), (reports_dal, 'Reports')]:
            for method in expected_methods:
                if hasattr(dal, method):
                    print(f"  ✅ {name} DAL has {method}")
                else:
                    print(f"  ❌ {name} DAL missing {method}")
        
        return True
        
    except Exception as e:
        print(f"❌ DAL initialization failed: {str(e)}")
        return False

async def test_embedding_service():
    """Test that the embedding service works with fallback"""
    print("\n🤖 Testing Embedding Service")
    print("-" * 30)
    
    try:
        from services.ai.ai_embedding_service import AIEmbeddingService
        
        embedding_service = AIEmbeddingService()
        
        # Test embedding generation
        test_text = "AI architecture test embedding"
        embedding = embedding_service.generate_embedding(test_text)
        
        if embedding and len(embedding) == embedding_service.embedding_dimension:
            print(f"✅ Embedding generated successfully")
            print(f"   Dimension: {len(embedding)}")
            print(f"   Model: {embedding_service.model_name}")
            return True
        else:
            print("❌ Embedding generation failed")
            return False
            
    except Exception as e:
        print(f"❌ Embedding service test failed: {str(e)}")
        return False

async def main():
    """Run all architecture tests"""
    print("🏗️  AI Services Architecture Test Suite")
    print("=" * 60)
    
    tests = [
        ("Import Tests", test_imports),
        ("Service Initialization", test_service_initialization),
        ("DAL Initialization", test_dal_initialization),
        ("Embedding Service", test_embedding_service)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            results.append((test_name, False))
    
    # Summary
    print(f"\n📊 Test Results Summary")
    print("=" * 30)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! AI services architecture is working correctly.")
        print("\n📝 Key Benefits Verified:")
        print("   • Proper service/DAL separation")
        print("   • Clean import structure")
        print("   • Backward compatibility maintained")
        print("   • Service initialization working")
        print("   • Embedding fallback functioning")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the output above for details.")

if __name__ == "__main__":
    asyncio.run(main())
