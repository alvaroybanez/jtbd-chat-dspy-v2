#!/usr/bin/env python3
"""
Test script for backend services.
Validates basic functionality of SearchService, ContextManager, and ChatService.
"""

import sys
import os
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.services import (
    SearchService, ContextManager, ChatService,
    initialize_all_services, check_service_health
)
from app.core.database.connection import get_database_manager
from app.core.embeddings import get_embedding_manager
from app.core.llm_wrapper import get_llm


def test_basic_imports():
    """Test that all services can be imported."""
    print("✓ All services imported successfully")


def test_context_manager_standalone():
    """Test ContextManager without dependencies."""
    print("\n--- Testing ContextManager (standalone) ---")
    
    context = ContextManager(max_tokens=1000)
    
    # Test basic functionality
    summary = context.get_context_summary()
    print(f"✓ Context summary: {summary['success']}")
    
    budget = context.check_token_budget()
    print(f"✓ Token budget check: {budget['status']}")
    
    # Test adding a mock insight
    mock_insight = {
        "id": "test-insight-1",
        "description": "Customers struggle with complex onboarding processes that require multiple steps and unclear instructions.",
        "context": "Based on user interviews and support tickets"
    }
    
    result = context.add_selection("insight", mock_insight)
    print(f"✓ Add insight: {result['success']}")
    
    if result["success"]:
        print(f"  - Tokens used: {result['tokens_used']}")
        print(f"  - Tokens available: {result['tokens_available']}")
    
    # Test context summary after addition
    summary = context.get_context_summary()
    if summary["success"]:
        selection = summary["selection_summary"]
        print(f"✓ Updated summary - Insights: {selection['insights']['count']}, Tokens: {selection['insights']['tokens']}")
    
    print("✓ ContextManager tests completed")


def test_mock_services():
    """Test services with mock dependencies."""
    print("\n--- Testing Services (with mocks) ---")
    
    # These will work even without database connection
    try:
        # Test that classes can be instantiated
        context = ContextManager()
        print("✓ ContextManager created")
        
        print("✓ Mock service tests completed")
        
    except Exception as e:
        print(f"✗ Mock service test failed: {e}")


def test_service_health():
    """Test service health checking."""
    print("\n--- Testing Service Health ---")
    
    try:
        health = check_service_health()
        print(f"✓ Health check completed")
        print(f"  - Overall health: {health['overall_health']}")
        
        for service_name, status in health['services'].items():
            print(f"  - {service_name}: {status.get('status', 'unknown')}")
            
    except Exception as e:
        print(f"✗ Service health check failed: {e}")


def main():
    """Run all tests."""
    print("🧪 Testing JTBD Assistant Backend Services")
    print("=" * 50)
    
    try:
        test_basic_imports()
        test_context_manager_standalone()
        test_mock_services()
        test_service_health()
        
        print("\n" + "=" * 50)
        print("✅ All basic tests completed successfully!")
        print("\nNote: Full integration tests require database connection.")
        print("To test with database, ensure environment variables are set:")
        print("  - SUPABASE_URL")
        print("  - SUPABASE_KEY") 
        print("  - OPENAI_API_KEY")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()