#!/usr/bin/env python3
"""
Test script for streaming chat functionality.

This script tests the new streaming chat capabilities added to Tradistry's AI system.
"""

import asyncio
import json
import sys
import os
from datetime import datetime

# Add the backend directory to sys.path to allow imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.ai.ai_orchestrator_service import AIOrchestrator


async def test_streaming_chat():
    """Test the streaming chat functionality."""
    print("🚀 Testing Streaming Chat Functionality\n")
    
    # Initialize the orchestrator
    print("1. Initializing AI Orchestrator...")
    try:
        orchestrator = AIOrchestrator()
        print("   ✅ AI Orchestrator initialized successfully")
    except Exception as e:
        print(f"   ❌ Failed to initialize AI Orchestrator: {str(e)}")
        return False
    
    # Check if LLM is available
    print("\n2. Checking LLM availability...")
    try:
        llm = orchestrator.llm
        if llm is None:
            print("   ❌ LLM not available - check OPENROUTER_API_KEY")
            return False
        print("   ✅ LLM is available and ready")
        print(f"   📋 Current model: {orchestrator.current_llm_model}")
    except Exception as e:
        print(f"   ❌ Error checking LLM: {str(e)}")
        return False
    
    # Mock user data
    mock_user = {
        "user_id": "test_user_123",
        "access_token": "Bearer test_token",
        "email": "test@example.com"
    }
    
    test_message = "Hello! Can you help me understand my trading performance?"
    session_id = "test_session_streaming"
    
    print(f"\n3. Testing streaming chat with message: '{test_message}'")
    print("   📡 Starting streaming response...\n")
    
    try:
        start_time = datetime.now()
        full_response = ""
        chunk_count = 0
        
        # Stream the response
        async for chunk in orchestrator.process_chat_message_stream(
            user=mock_user,
            session_id=session_id,
            user_message=test_message,
            context_limit=5
        ):
            chunk_count += 1
            chunk_type = chunk.get("type", "unknown")
            
            if chunk_type == "session_info":
                print(f"   🔗 Session: {chunk.get('session_id')} - {chunk.get('status')}")
                
            elif chunk_type == "token":
                content = chunk.get("content", "")
                full_response += content
                # Print token with visual indicator (limit to avoid flooding)
                if chunk_count <= 50:  # Limit output for readability
                    print(f"   🔤 Token {chunk_count}: '{content}'")
                elif chunk_count == 51:
                    print("   ... (limiting token output for readability)")
                    
            elif chunk_type == "done":
                print(f"   ✅ Streaming complete: {chunk.get('message')}")
                
            elif chunk_type == "response_saved":
                processing_time = chunk.get("processing_time_ms", 0)
                print(f"   💾 Response saved with ID: {chunk.get('message_id')}")
                print(f"   ⏱️  Processing time: {processing_time}ms")
                
            elif chunk_type == "error":
                print(f"   ❌ Error: {chunk.get('message')}")
                return False
                
            elif chunk_type == "warning":
                print(f"   ⚠️  Warning: {chunk.get('message')}")
        
        end_time = datetime.now()
        total_time = (end_time - start_time).total_seconds() * 1000
        
        print(f"\n📊 Streaming Test Results:")
        print(f"   • Total chunks received: {chunk_count}")
        print(f"   • Total processing time: {total_time:.2f}ms")
        print(f"   • Response length: {len(full_response)} characters")
        print(f"   • Average time per chunk: {total_time/chunk_count:.2f}ms")
        
        if full_response:
            print(f"\n📝 Complete Response Preview:")
            print(f"   {full_response[:200]}{'...' if len(full_response) > 200 else ''}")
            return True
        else:
            print("   ❌ No response content received")
            return False
            
    except Exception as e:
        print(f"   ❌ Streaming test failed: {str(e)}")
        return False


async def test_llm_streaming_directly():
    """Test LLM streaming capability directly."""
    print("\n🔧 Testing LLM Streaming Directly\n")
    
    try:
        orchestrator = AIOrchestrator()
        llm = orchestrator.llm
        
        if llm is None:
            print("   ❌ LLM not available")
            return False
        
        test_prompt = "Write a brief explanation of what trading analytics involves:"
        print(f"   📤 Testing direct LLM streaming with prompt: '{test_prompt}'")
        
        response_chunks = []
        async for chunk in orchestrator._stream_llm_response(test_prompt):
            response_chunks.append(chunk)
            chunk_type = chunk.get("type")
            
            if chunk_type == "token":
                content = chunk.get("content", "")
                print(f"   🔤 Token: '{content}'")
            elif chunk_type == "done":
                print(f"   ✅ {chunk.get('message')}")
            elif chunk_type == "error":
                print(f"   ❌ {chunk.get('message')}")
                return False
        
        print(f"   📊 Received {len(response_chunks)} chunks")
        return True
        
    except Exception as e:
        print(f"   ❌ Direct LLM streaming test failed: {str(e)}")
        return False


def print_test_header():
    """Print a nice header for the test."""
    print("=" * 60)
    print("🧪 TRADISTRY STREAMING CHAT TEST")
    print("=" * 60)
    print("This script tests the new streaming chat functionality")
    print("which enables token-by-token response generation for")
    print("dramatically improved perceived performance.")
    print("=" * 60)


async def main():
    """Main test function."""
    print_test_header()
    
    # Test 1: Direct LLM streaming
    success1 = await test_llm_streaming_directly()
    
    # Test 2: Full streaming chat pipeline
    success2 = await test_streaming_chat()
    
    print("\n" + "=" * 60)
    print("📋 FINAL TEST RESULTS")
    print("=" * 60)
    print(f"Direct LLM Streaming: {'✅ PASSED' if success1 else '❌ FAILED'}")
    print(f"Full Streaming Chat:  {'✅ PASSED' if success2 else '❌ FAILED'}")
    
    if success1 and success2:
        print("\n🎉 All streaming tests PASSED!")
        print("The streaming chat system is ready for production use.")
    else:
        print(f"\n⚠️  Some tests FAILED. Please check the error messages above.")
        
    print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⏹️  Test interrupted by user")
    except Exception as e:
        print(f"\n\n💥 Unexpected error: {str(e)}")
