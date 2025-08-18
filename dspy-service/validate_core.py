#!/usr/bin/env python3
"""
Core validation script for Task 6.1 that doesn't require DSPy imports.
"""

import sys
import traceback

def test_core_modules():
    """Test core modules without DSPy dependencies."""
    print("Testing core modules...")
    
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
        assert Config.DEFAULT_HMW_COUNT == 5
        assert Config.DEFAULT_SOLUTION_COUNT == 5
        print("✓ Default configuration values correct")
        
        # Test configuration methods
        test_config = Config()
        test_config.OPENAI_API_KEY = "test-key"
        test_config.API_KEY = "test-api-key"
        
        dspy_config = test_config.get_dspy_config()
        assert 'model' in dspy_config
        assert 'api_key' in dspy_config
        assert dspy_config['temperature'] == 0.7
        assert dspy_config['max_tokens'] == 3000
        print("✓ DSPy configuration generation works")
        
        lm_config = test_config.get_openai_lm_config()
        assert 'api_key' in lm_config
        assert 'temperature' in lm_config
        assert lm_config['temperature'] == 0.7
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
        from models.requests import GenerateHMWRequest, ContextItem, HMWItem, CreateSolutionsRequest
        from models.responses import HMWResult, MetaInfo, SolutionResult
        from models.errors import ErrorResponse, ValidationErrorDetail
        
        # Test context item
        item = ContextItem(id="test-1", content="Test content")
        assert item.id == "test-1"
        assert item.content == "Test content"
        print("✓ ContextItem model works")
        
        # Test HMW request
        request = GenerateHMWRequest(
            context={
                "insights": [{"id": "i1", "content": "Test insight"}]
            },
            count=5,
            temperature=0.8
        )
        assert request.count == 5
        assert request.temperature == 0.8
        print("✓ GenerateHMWRequest model works")
        
        # Test HMW item
        hmw_item = HMWItem(
            id="hmw-1",
            question="How might we test this system?",
            score=8.5
        )
        assert hmw_item.score == 8.5
        print("✓ HMWItem model works")
        
        # Test solution request
        sol_request = CreateSolutionsRequest(
            hmws=[hmw_item],
            context={
                "metrics": [{"id": "m1", "name": "Test Metric", "unit": "score"}]
            },
            count=3
        )
        assert len(sol_request.hmws) == 1
        assert sol_request.count == 3
        print("✓ CreateSolutionsRequest model works")
        
        # Test HMW result
        result = HMWResult(
            question="How might we test this?",
            score=8.5,
            confidence=0.9
        )
        assert result.score == 8.5
        assert result.confidence == 0.9
        print("✓ HMWResult model works")
        
        # Test solution result with computed final score
        solution = SolutionResult(
            title="Improve Testing",
            description="Implement comprehensive testing framework",
            impact_score=8,
            effort_score=4,
            assigned_metrics=["metric-1"]
        )
        assert solution.final_score == 2.0  # 8/4 = 2.0
        print("✓ SolutionResult with computed fields works")
        
        # Test meta info with computed duration
        meta = MetaInfo(duration_ms=1500, retries=2)
        assert meta.duration_seconds == 1.5
        assert meta.retries == 2
        print("✓ MetaInfo with computed fields works")
        
        # Test error response factory methods
        error = ErrorResponse.invalid_api_key()
        assert error.code == "INVALID_API_KEY"
        assert error.action == "NONE"
        
        error2 = ErrorResponse.dspy_generation_error("Test error")
        assert error2.code == "DSPY_GENERATION_ERROR"
        assert error2.action == "RETRY"
        assert "Test error" in error2.message
        print("✓ ErrorResponse factory methods work")
        
        # Test validation error detail
        detail = ValidationErrorDetail(
            field="context.insights",
            message="Field is required",
            invalid_value=None
        )
        assert detail.field == "context.insights"
        print("✓ ValidationErrorDetail works")
        
        return True
    except Exception as e:
        print(f"✗ Pydantic model test failed: {e}")
        traceback.print_exc()
        return False

def test_logging():
    """Test logging utility."""
    print("\nTesting logging...")
    
    try:
        from utils import logger, log_request, log_response, log_error, log_execution_time
        
        # Test basic logging
        logger.info("Test log message for validation")
        print("✓ Basic logging works")
        
        # Test structured logging
        log_request("/test", "POST", "test-request-id")
        log_response("/test", "POST", 200, 150.5, "test-request-id")
        log_error("Test error message", request_id="test-request-id", error_code="TEST_ERROR")
        print("✓ Structured logging functions work")
        
        # Test execution time logging context manager
        with log_execution_time("test_operation", "test-request-id") as timing:
            # Simulate some work
            import time
            time.sleep(0.01)
            assert "start_time" in timing
        
        assert "duration_ms" in timing
        print("✓ Execution time logging context manager works")
        
        return True
    except Exception as e:
        print(f"✗ Logging test failed: {e}")
        traceback.print_exc()
        return False

def test_model_validation_edge_cases():
    """Test model validation edge cases and error conditions."""
    print("\nTesting model validation edge cases...")
    
    try:
        from models.requests import GenerateHMWRequest, HMWItem
        from pydantic import ValidationError
        
        # Test HMW format validation
        try:
            HMWItem(id="bad", question="What if we try this?")  # Wrong format
            assert False, "Should have failed validation"
        except ValidationError:
            print("✓ HMW format validation works")
        
        # Test empty context validation
        try:
            GenerateHMWRequest(context={})  # Empty context should fail
            assert False, "Should have failed validation"
        except ValidationError:
            print("✓ Empty context validation works")
        
        # Test invalid context keys
        try:
            GenerateHMWRequest(context={"invalid_key": ["data"]})
            assert False, "Should have failed validation"
        except ValidationError:
            print("✓ Invalid context key validation works")
        
        return True
    except Exception as e:
        print(f"✗ Model validation edge cases test failed: {e}")
        traceback.print_exc()
        return False

def main():
    """Run core validation tests."""
    print("=== Task 6.1 Core Validation ===\n")
    
    tests = [
        ("Core Modules", test_core_modules),
        ("Configuration", test_configuration), 
        ("Pydantic Models", test_pydantic_models),
        ("Logging", test_logging),
        ("Model Validation Edge Cases", test_model_validation_edge_cases)
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
        print("🎉 All core tests passed! Task 6.1 foundation is solid.")
        print("\nNext steps:")
        print("- Install dependencies: pip install -r requirements.txt")
        print("- Set environment variables: OPENAI_API_KEY, API_KEY")
        print("- Task 6.2: Implement HMW generation with DSPy")
        print("- Task 6.3: Implement solution creation with DSPy")
        return 0
    else:
        print("❌ Some core tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())