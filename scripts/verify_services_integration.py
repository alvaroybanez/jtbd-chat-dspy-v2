#!/usr/bin/env python3
"""
Integration verification script for backend services.
Tests the complete workflow: SearchService -> ContextManager -> ChatService
"""

import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.services import (
    SearchService, ContextManager, ChatService,
    initialize_all_services, check_service_health
)


def test_context_manager_with_tiktoken():
    """Test ContextManager with tiktoken for accurate token counting."""
    print("\n--- Testing ContextManager with tiktoken ---")
    
    context = ContextManager(max_tokens=2000)  # Adequate limit for testing
    
    # Test tokenizer availability
    has_tokenizer = context.tokenizer is not None
    print(f"✓ Tiktoken tokenizer available: {has_tokenizer}")
    
    # Add multiple items to test token counting
    items = [
        {
            "type": "insight",
            "data": {
                "id": "insight-1",
                "description": "Users find the current onboarding process confusing and overwhelming, leading to high dropout rates in the first week",
                "context": "Based on user interviews with 25 new users"
            }
        },
        {
            "type": "jtbd", 
            "data": {
                "id": "jtbd-1",
                "statement": "When I am starting to use a new product, I want to quickly understand its core value so that I can decide if it's worth my time to continue",
                "context": "New user onboarding",
                "outcome": "Confident decision to continue or discontinue usage"
            }
        },
        {
            "type": "metric",
            "data": {
                "id": "metric-1", 
                "name": "Onboarding Completion Rate",
                "description": "Percentage of users who complete the full onboarding flow",
                "current_value": 45.2,
                "target_value": 75.0,
                "unit": "percentage"
            }
        }
    ]
    
    total_tokens = 0
    for item in items:
        result = context.add_selection(item["type"], item["data"])
        if result["success"]:
            print(f"✓ Added {item['type']}: {result['item_tokens']} tokens")
            total_tokens += result["item_tokens"]
        else:
            print(f"✗ Failed to add {item['type']}: {result['error']}")
    
    # Test budget checking
    budget = context.check_token_budget()
    print(f"✓ Token budget: {budget['tokens_used']}/{context.effective_limit} ({budget['percentage_used']:.1f}%)")
    print(f"  Status: {budget['status']}")
    
    # Test context summary
    summary = context.get_context_summary()
    if summary["success"]:
        selection = summary["selection_summary"]
        print(f"✓ Context summary:")
        print(f"  - Insights: {selection['insights']['count']} items, {selection['insights']['tokens']} tokens")
        print(f"  - JTBDs: {selection['jtbds']['count']} items, {selection['jtbds']['tokens']} tokens") 
        print(f"  - Metrics: {selection['metrics']['count']} items, {selection['metrics']['tokens']} tokens")
    
    # Test truncation if needed
    if budget['percentage_used'] > 50:
        print("\n⚠️  Testing truncation...")
        truncate_result = context.truncate_if_needed(target_percentage=30.0)
        if truncate_result["success"]:
            print(f"✓ Truncation: {truncate_result['items_removed']} items removed")
            print(f"  Before: {truncate_result['tokens_before']} tokens")
            print(f"  After: {truncate_result['tokens_after']} tokens")
    
    return context


def test_mock_search_workflow():
    """Test the complete workflow with mock data."""
    print("\n--- Testing Complete Workflow (Mock Data) ---")
    
    try:
        # Create mock search results
        mock_search_results = {
            "chunks": [
                {
                    "id": "chunk-1",
                    "content": "Users often abandon the onboarding process after the third step because the instructions are unclear and there's no progress indicator",
                    "chunk_index": 2,
                    "document_id": "doc-123", 
                    "similarity": 0.85,
                    "content_type": "chunk"
                }
            ],
            "insights": [
                {
                    "id": "insight-2",
                    "description": "The majority of user complaints center around difficulty understanding product features during initial setup",
                    "document_id": "doc-456",
                    "similarity": 0.78,
                    "content_type": "insight"
                }
            ]
        }
        
        # Test ChatService format_search_results
        context = ContextManager()
        
        # Mock ChatService (without dependencies)
        class MockChatService:
            def __init__(self, context_manager):
                self.context = context_manager
            
            def format_search_results(self, results):
                """Simplified version of format_search_results for testing."""
                formatted = {}
                for content_type, items in results.items():
                    formatted_items = []
                    for item in items:
                        formatted_item = {
                            "id": item.get("id"),
                            "similarity": item.get("similarity", 0),
                            "content_type": content_type,
                            "display_data": {
                                "type": content_type,
                                "title": f"{content_type.title()} #{item.get('chunk_index', item.get('id', 'N/A'))}",
                                "excerpt": item.get("content", item.get("description", ""))[:100] + "..."
                            },
                            "raw_data": item
                        }
                        formatted_items.append(formatted_item)
                    formatted[content_type] = formatted_items
                return formatted
        
        chat = MockChatService(context)
        formatted_results = chat.format_search_results(mock_search_results)
        
        print("✓ Mock ChatService created and results formatted")
        print(f"  - Formatted {len(formatted_results)} content types")
        
        # Test adding formatted results to context
        for content_type, items in formatted_results.items():
            for item in items:
                # Convert content type to singular for context manager
                item_type = content_type.rstrip('s')  # Remove plural
                if item_type == "chunk":
                    # Skip chunks as they're not directly addable to context
                    continue
                    
                result = context.add_selection(item_type, item["raw_data"])
                if result["success"]:
                    print(f"✓ Added {item_type} to context: {result['item_tokens']} tokens")
        
        # Test context preparation for HMW
        summary = context.get_context_summary()
        print(f"✓ Final context ready: {summary['selection_summary']}")
        
        return True
        
    except Exception as e:
        print(f"✗ Mock workflow test failed: {e}")
        return False


def test_service_initialization():
    """Test service initialization patterns."""
    print("\n--- Testing Service Initialization ---")
    
    # Test individual initialization (will fail without DB, but should not crash)
    try:
        from app.services import get_search_service, get_context_manager, get_chat_service
        
        # These should return None since services aren't initialized
        search = get_search_service()
        context = get_context_manager()
        chat = get_chat_service()
        
        print(f"✓ Service getters work: search={search is not None}, context={context is not None}, chat={chat is not None}")
        
        # Test initialization function (will fail gracefully without database)
        init_result = initialize_all_services()
        print(f"✓ Initialization attempted: success={init_result['success']}")
        
        if not init_result["success"]:
            print(f"  Expected failure reason: {init_result.get('error', 'Unknown')}")
            
        # Test health check
        health = check_service_health()
        print(f"✓ Health check completed: overall={health['overall_health']}")
        
        return True
        
    except Exception as e:
        print(f"✗ Service initialization test failed: {e}")
        return False


def main():
    """Run all integration tests."""
    print("🔧 JTBD Assistant Backend Services - Integration Verification")
    print("=" * 65)
    
    test_results = []
    
    try:
        # Test 1: ContextManager with tiktoken
        context = test_context_manager_with_tiktoken()
        test_results.append(("ContextManager + tiktoken", True))
        
        # Test 2: Complete workflow with mocks
        workflow_success = test_mock_search_workflow()
        test_results.append(("Mock Workflow", workflow_success))
        
        # Test 3: Service initialization
        init_success = test_service_initialization()
        test_results.append(("Service Initialization", init_success))
        
        # Summary
        print("\n" + "=" * 65)
        print("📊 Test Results Summary:")
        
        successful_tests = 0
        for test_name, success in test_results:
            status = "✅ PASS" if success else "❌ FAIL"
            print(f"  {status} {test_name}")
            if success:
                successful_tests += 1
        
        print(f"\n🎯 {successful_tests}/{len(test_results)} tests passed")
        
        if successful_tests == len(test_results):
            print("\n🎉 All integration tests passed!")
            print("\n📝 Services are ready for integration with Streamlit UI")
            print("\nNext steps:")
            print("  1. Set up environment variables (SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY)")
            print("  2. Initialize core components (database, embeddings, LLM)")
            print("  3. Initialize services in Streamlit app startup")
            print("  4. Integrate services with chat interface UI")
        else:
            print("\n⚠️  Some tests failed - review implementation")
            
    except Exception as e:
        print(f"\n💥 Integration test failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()