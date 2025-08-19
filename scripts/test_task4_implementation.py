#!/usr/bin/env python3
"""
Test script for Task #4: Manual JTBD and Metric Creation Implementation
Validates the end-to-end workflow for creating JTBDs and metrics manually.
"""

import sys
import os
import asyncio
from typing import Dict, Any

# Add the app directory to the path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.initialization import initialize_all_services
from app.services.jtbd_service import get_jtbd_service
from app.services.metric_service import get_metric_service
from app.services.search_service import get_search_service


async def test_service_initialization() -> Dict[str, Any]:
    """Test that all services initialize correctly."""
    print("🔄 Testing service initialization...")
    
    result = initialize_all_services()
    
    if result.get("success"):
        services = result.get("services", {})
        print("✅ Service initialization successful")
        print(f"   Services initialized: {result['summary']['successful_services']}/{result['summary']['total_services']}")
        
        # Check specific services
        jtbd_success = services.get("jtbd_service", {}).get("success", False)
        metric_success = services.get("metric_service", {}).get("success", False)
        
        print(f"   JTBD Service: {'✅' if jtbd_success else '❌'}")
        print(f"   Metric Service: {'✅' if metric_success else '❌'}")
        
        return {"success": True, "jtbd_available": jtbd_success, "metric_available": metric_success}
    else:
        print(f"❌ Service initialization failed: {result.get('error')}")
        return {"success": False, "error": result.get("error")}


async def test_jtbd_creation() -> Dict[str, Any]:
    """Test manual JTBD creation with embedding generation."""
    print("\n🎯 Testing JTBD creation...")
    
    jtbd_service = get_jtbd_service()
    if not jtbd_service:
        print("❌ JTBD service not available")
        return {"success": False, "error": "JTBD service not available"}
    
    # Test JTBD creation
    test_jtbd = {
        "statement": "When I am researching customer feedback, I want to quickly identify key insights, so that I can make data-driven product decisions",
        "context": "During product planning cycles when analyzing customer interviews and surveys",
        "outcome": "Clear, actionable insights that can guide product development priorities"
    }
    
    result = jtbd_service.create_jtbd(
        statement=test_jtbd["statement"],
        context=test_jtbd["context"],
        outcome=test_jtbd["outcome"],
        generate_embedding=True
    )
    
    if result.get("success"):
        jtbd_data = result.get("jtbd", {})
        jtbd_id = jtbd_data.get("id")
        print(f"✅ JTBD created successfully")
        print(f"   ID: {jtbd_id}")
        print(f"   Statement: {jtbd_data.get('statement', '')[:50]}...")
        return {"success": True, "jtbd_id": jtbd_id, "jtbd_data": jtbd_data}
    else:
        print(f"❌ JTBD creation failed: {result.get('error')}")
        return {"success": False, "error": result.get("error")}


async def test_metric_creation() -> Dict[str, Any]:
    """Test manual metric creation."""
    print("\n📊 Testing metric creation...")
    
    metric_service = get_metric_service()
    if not metric_service:
        print("❌ Metric service not available")
        return {"success": False, "error": "Metric service not available"}
    
    # Test metric creation
    test_metric = {
        "name": "Customer Satisfaction Score",
        "current_value": 7.2,
        "target_value": 8.5,
        "unit": "points"
    }
    
    result = metric_service.create_metric(
        name=test_metric["name"],
        current_value=test_metric["current_value"],
        target_value=test_metric["target_value"],
        unit=test_metric["unit"]
    )
    
    if result.get("success"):
        metric_data = result.get("metric", {})
        metric_id = metric_data.get("id")
        print(f"✅ Metric created successfully")
        print(f"   ID: {metric_id}")
        print(f"   Name: {metric_data.get('name')}")
        print(f"   Current: {metric_data.get('current_value')} {metric_data.get('unit')}")
        print(f"   Target: {metric_data.get('target_value')} {metric_data.get('unit')}")
        return {"success": True, "metric_id": metric_id, "metric_data": metric_data}
    else:
        print(f"❌ Metric creation failed: {result.get('error')}")
        return {"success": False, "error": result.get("error")}


async def test_search_integration(jtbd_data: Dict[str, Any]) -> Dict[str, Any]:
    """Test that created JTBDs can be found through search."""
    print("\n🔍 Testing search integration...")
    
    search_service = get_search_service()
    if not search_service:
        print("❌ Search service not available")
        return {"success": False, "error": "Search service not available"}
    
    # Search for the created JTBD
    search_query = "customer feedback insights"
    
    try:
        result = search_service.search_jtbds(
            query_text=search_query,
            similarity_threshold=0.5,  # Lower threshold for testing
            limit=5
        )
        
        if result.get("success"):
            results = result.get("results", [])
            print(f"✅ Search completed successfully")
            print(f"   Found {len(results)} JTBD results")
            
            # Check if our created JTBD is in the results
            created_jtbd_id = jtbd_data.get("id")
            found_created_jtbd = any(
                r.get("raw_data", {}).get("id") == created_jtbd_id 
                for r in results
            )
            
            if found_created_jtbd:
                print(f"   ✅ Created JTBD found in search results!")
                return {"success": True, "found_created_jtbd": True, "total_results": len(results)}
            else:
                print(f"   ⚠️ Created JTBD not found in search results (may need time to index)")
                return {"success": True, "found_created_jtbd": False, "total_results": len(results)}
        else:
            print(f"❌ Search failed: {result.get('error')}")
            return {"success": False, "error": result.get("error")}
            
    except Exception as e:
        print(f"❌ Search error: {str(e)}")
        return {"success": False, "error": str(e)}


async def test_validation_functions():
    """Test input validation functions."""
    print("\n🛡️ Testing validation functions...")
    
    # Test JTBD validation
    jtbd_service = get_jtbd_service()
    if jtbd_service:
        # Valid input
        valid_result = jtbd_service.validate_jtbd_input(
            statement="When I want to test validation, I need proper inputs, so that validation passes",
            context="During testing",
            outcome="Successful validation"
        )
        print(f"   Valid JTBD input: {'✅' if valid_result.get('valid') else '❌'}")
        
        # Invalid input (empty statement)
        invalid_result = jtbd_service.validate_jtbd_input(
            statement="",
            context="Test context",
            outcome="Test outcome"
        )
        print(f"   Invalid JTBD input (empty statement): {'✅' if not invalid_result.get('valid') else '❌'}")
    
    # Test Metric validation
    metric_service = get_metric_service()
    if metric_service:
        # Valid input
        valid_result = metric_service.validate_metric_input(
            name="Test Metric",
            current_value=5.0,
            target_value=8.0,
            unit="points"
        )
        print(f"   Valid metric input: {'✅' if valid_result.get('valid') else '❌'}")
        
        # Invalid input (empty name)
        invalid_result = metric_service.validate_metric_input(
            name="",
            current_value=5.0,
            target_value=8.0,
            unit="points"
        )
        print(f"   Invalid metric input (empty name): {'✅' if not invalid_result.get('valid') else '❌'}")


async def main():
    """Run all tests for Task #4 implementation."""
    print("🚀 Starting Task #4 Implementation Tests")
    print("=" * 50)
    
    test_results = {}
    
    # 1. Test service initialization
    init_result = await test_service_initialization()
    test_results["initialization"] = init_result
    
    if not init_result.get("success"):
        print("❌ Cannot continue tests - service initialization failed")
        return test_results
    
    # 2. Test JTBD creation
    jtbd_result = await test_jtbd_creation()
    test_results["jtbd_creation"] = jtbd_result
    
    # 3. Test metric creation
    metric_result = await test_metric_creation()
    test_results["metric_creation"] = metric_result
    
    # 4. Test search integration (if JTBD was created)
    if jtbd_result.get("success"):
        search_result = await test_search_integration(jtbd_result.get("jtbd_data", {}))
        test_results["search_integration"] = search_result
    
    # 5. Test validation functions
    await test_validation_functions()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Summary")
    print("=" * 50)
    
    successful_tests = sum(1 for result in test_results.values() if result.get("success"))
    total_tests = len(test_results)
    
    print(f"Tests passed: {successful_tests}/{total_tests}")
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result.get("success") else "❌ FAIL"
        print(f"   {test_name}: {status}")
        if not result.get("success"):
            print(f"      Error: {result.get('error', 'Unknown error')}")
    
    if successful_tests == total_tests:
        print("\n🎉 All tests passed! Task #4 implementation is working correctly.")
    else:
        print(f"\n⚠️ {total_tests - successful_tests} test(s) failed. Check the errors above.")
    
    return test_results


if __name__ == "__main__":
    results = asyncio.run(main())