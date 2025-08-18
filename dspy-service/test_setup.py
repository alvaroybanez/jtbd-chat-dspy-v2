#!/usr/bin/env python3
"""
Test script to validate the Task 6.1 setup works correctly.
"""

import os
import sys
import traceback
from typing import Dict, Any

def test_imports():
    """Test that all modules can be imported successfully."""
    print("Testing imports...")
    
    try:
        from config import config, Config
        print("✓ Config module imported successfully")
        
        from models import (
            GenerateHMWRequest, CreateSolutionsRequest,
            GenerateHMWResponse, CreateSolutionsResponse,
            ErrorResponse
        )
        print("✓ Models imported successfully")
        
        from utils import logger, log_request, log_response
        print("✓ Utils imported successfully")
        
        from dspy_modules import initialize_dspy, is_initialized
        print("✓ DSPy modules imported successfully")
        
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        traceback.print_exc()
        return False

def test_configuration():
    """Test configuration validation and methods."""
    print("\nTesting configuration...")
    
    try:
        from config import Config
        
        # Test default values
        assert Config.OPENAI_MODEL == "gpt-5-nano"
        assert Config.OPENAI_TEMPERATURE == 0.7
        assert Config.HOST == "0.0.0.0"
        assert Config.PORT == 8000
        print("✓ Default configuration values correct")
        
        # Test configuration methods
        with_api_key = Config()
        with_api_key.OPENAI_API_KEY = "test-key"
        with_api_key.API_KEY = "test-api-key"
        
        dspy_config = with_api_key.get_dspy_config()
        assert 'model' in dspy_config
        assert 'api_key' in dspy_config
        print("✓ DSPy configuration generation works")
        
        lm_config = with_api_key.get_openai_lm_config()
        assert 'api_key' in lm_config
        assert 'temperature' in lm_config
        print("✓ OpenAI LM configuration generation works")
        
        return True
    except Exception as e:
        print(f"✗ Configuration test failed: {e}")
        traceback.print_exc()
        return False

def test_pydantic_models():
    """Test Pydantic model validation."""
    print("\nTesting Pydantic models...")
    
    try:
        from models.requests import GenerateHMWRequest, ContextItem
        from models.responses import HMWResult, MetaInfo
        from models.errors import ErrorResponse
        
        # Test context item
        item = ContextItem(id="test-1", content="Test content")
        assert item.id == "test-1"
        print("✓ ContextItem model works")
        
        # Test HMW request
        request = GenerateHMWRequest(
            context={
                "insights": [{"id": "i1", "content": "Test insight"}]
            },
            count=5
        )
        assert request.count == 5
        print("✓ GenerateHMWRequest model works")
        
        # Test HMW result
        result = HMWResult(
            question="How might we test this?",
            score=8.5
        )
        assert result.score == 8.5
        print("✓ HMWResult model works")
        
        # Test error response
        error = ErrorResponse.invalid_api_key()
        assert error.code == "INVALID_API_KEY"
        assert error.action == "NONE"
        print("✓ ErrorResponse factory methods work")
        
        return True
    except Exception as e:
        print(f"✗ Pydantic model test failed: {e}")
        traceback.print_exc()
        return False

def test_logging():
    """Test logging utility."""
    print("\nTesting logging...")
    
    try:
        from utils import logger, log_request, log_response, log_error
        
        # Test basic logging
        logger.info("Test log message")
        print("✓ Basic logging works")
        
        # Test structured logging
        log_request("/test", "GET", "test-request-id")
        log_response("/test", "GET", 200, 100.5, "test-request-id")
        log_error("Test error", request_id="test-request-id")
        print("✓ Structured logging functions work")
        
        return True
    except Exception as e:
        print(f"✗ Logging test failed: {e}")
        traceback.print_exc()
        return False

def test_dspy_stubs():
    """Test DSPy module stubs."""
    print("\nTesting DSPy module stubs...")
    
    try:
        from dspy_modules.hmw_generator import HMWGenerator, format_context_for_generation
        from dspy_modules.solution_generator import SolutionGenerator, format_context_for_solution_generation
        from models.requests import GenerateHMWRequest, CreateSolutionsRequest, HMWItem
        
        # Test HMW generator
        generator = HMWGenerator()
        result = generator.forward(
            insights=["Test insight"], 
            metrics=["Test metric"],
            jtbds=["Test JTBD"],
            count=3
        )
        assert 'hmw_questions' in result
        print("✓ HMWGenerator stub works")
        
        # Test solution generator  
        sol_generator = SolutionGenerator()
        sol_result = sol_generator.forward(
            hmw_questions=["How might we test?"],
            available_metrics=["Test metric"],
            context_insights=["Test insight"],
            context_jtbds=["Test JTBD"],
            count=2
        )
        assert 'solution_titles' in sol_result
        print("✓ SolutionGenerator stub works")
        
        return True
    except Exception as e:
        print(f"✗ DSPy stubs test failed: {e}")
        traceback.print_exc()
        return False

def test_fastapi_app():
    """Test FastAPI app creation."""
    print("\nTesting FastAPI app...")
    
    try:
        # Mock DSPy initialization to avoid requiring API keys
        import os
        os.environ['OPENAI_API_KEY'] = 'test-key'
        os.environ['API_KEY'] = 'test-api-key'
        
        # Import after setting env vars
        from fastapi.testclient import TestClient
        from unittest.mock import patch
        
        with patch('dspy_modules.initialize_dspy', return_value=True):
            from main import app
            
            client = TestClient(app)
            
            # Test health endpoint
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["service"] == "intelligence"
            print("✓ Health endpoint works")
            
            # Test API documentation
            response = client.get("/docs")
            assert response.status_code == 200
            print("✓ API documentation endpoint works")
            
            return True
    except Exception as e:
        print(f"✗ FastAPI app test failed: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all tests."""
    print("=== Task 6.1 Setup Validation ===\n")
    
    tests = [
        ("Imports", test_imports),
        ("Configuration", test_configuration), 
        ("Pydantic Models", test_pydantic_models),
        ("Logging", test_logging),
        ("DSPy Stubs", test_dspy_stubs),
        ("FastAPI App", test_fastapi_app)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        if test_func():
            passed += 1
            print(f"✓ {test_name} passed")
        else:
            print(f"✗ {test_name} failed")
    
    print(f"\n=== Results ===")
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed! Task 6.1 setup is working correctly.")
        return 0
    else:
        print("❌ Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())