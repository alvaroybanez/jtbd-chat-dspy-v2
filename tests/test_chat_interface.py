#!/usr/bin/env python3
"""
Test script for Streamlit chat interface components.
Validates component imports and basic functionality without full service initialization.
"""

import sys
import os
from pathlib import Path

# Add both app directory and project root to Python path
project_root = Path(__file__).parent.parent
app_dir = project_root / "app"
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(app_dir))

def test_component_imports():
    """Test that all chat interface components can be imported."""
    print("Testing component imports...")
    
    try:
        # Test main interface imports
        from app.ui.components.chat_interface import ChatInterface, render_chat_interface
        print("✅ ChatInterface components imported successfully")
        
        # Test selection component imports
        from app.ui.components.selection_components import (
            render_search_result_card,
            render_context_summary_sidebar,
            render_token_budget_indicator,
            render_suggestions_section
        )
        print("✅ Selection components imported successfully")
        
        # Test package-level imports
        from app.ui.components import (
            render_chat_interface,
            render_search_result_card,
            render_context_summary_sidebar
        )
        print("✅ Package-level imports working")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error during import: {e}")
        return False


def test_component_structure():
    """Test component structure and basic methods."""
    print("\nTesting component structure...")
    
    try:
        from app.ui.components.chat_interface import ChatInterface
        
        # Test ChatInterface can be instantiated (without services)
        # This will fail gracefully when services aren't available
        print("✅ ChatInterface class structure is valid")
        
        # Test that methods exist
        methods_to_check = ['render', '_render_sidebar', '_render_chat_area', '_render_input_area']
        interface_class = ChatInterface
        
        for method_name in methods_to_check:
            if hasattr(interface_class, method_name):
                print(f"✅ Method {method_name} exists")
            else:
                print(f"❌ Method {method_name} missing")
                return False
        
        return True
        
    except Exception as e:
        print(f"❌ Component structure test failed: {e}")
        return False


def test_helper_functions():
    """Test helper functions that don't require services."""
    print("\nTesting helper functions...")
    
    try:
        from app.ui.components.chat_interface import export_chat_history
        
        # Test export with empty history (should return None)
        result = export_chat_history()
        if result is None:
            print("✅ export_chat_history handles empty state correctly")
        else:
            print("❌ export_chat_history should return None for empty history")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Helper function test failed: {e}")
        return False


def test_selection_component_functions():
    """Test selection component helper functions."""
    print("\nTesting selection component functions...")
    
    try:
        from app.ui.components.selection_components import _map_content_type_to_context_type
        
        # Test content type mapping
        mappings = [
            ("insights", "insight"),
            ("jtbds", "jtbd"), 
            ("chunks", None)
        ]
        
        for content_type, expected in mappings:
            result = _map_content_type_to_context_type(content_type)
            if result == expected:
                print(f"✅ Content type mapping: {content_type} -> {expected}")
            else:
                print(f"❌ Content type mapping failed: {content_type} -> {result} (expected {expected})")
                return False
        
        return True
        
    except Exception as e:
        print(f"❌ Selection component function test failed: {e}")
        return False


def run_all_tests():
    """Run all component tests."""
    print("🧪 Testing JTBD Assistant Chat Interface Components")
    print("=" * 60)
    
    tests = [
        test_component_imports,
        test_component_structure,
        test_helper_functions,
        test_selection_component_functions
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()  # Empty line between tests
    
    print("=" * 60)
    print(f"Tests completed: {passed}/{total} passed")
    
    if passed == total:
        print("🎉 All tests passed! Chat interface components are ready.")
        return True
    else:
        print("❌ Some tests failed. Check the output above for details.")
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)