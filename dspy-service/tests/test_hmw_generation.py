"""
Tests for HMW generation functionality.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from dspy_modules.hmw_generator import HMWGenerator, format_context_for_generation, format_generation_results
from models.requests import GenerateHMWRequest
from models.responses import HMWResult


class TestHMWGenerator:
    """Test HMW generation functionality."""
    
    def test_hmw_normalization(self):
        """Test HMW question normalization."""
        generator = HMWGenerator()
        
        test_cases = [
            ("improve user experience", "How might we improve user experience?"),
            ("we could make it better", "How might we make it better?"),
            ("What if we solved this problem?", "How might we solved this problem?"),
            ("How might we already perfect?", "How might we already perfect?"),
            ("Could we enhance the design", "How might we enhance the design?"),
        ]
        
        for input_text, expected in test_cases:
            result = generator._normalize_hmw_question(input_text)
            assert result == expected, f"Expected '{expected}', got '{result}'"
    
    def test_relevance_scoring(self):
        """Test relevance score calculation."""
        generator = HMWGenerator()
        
        question = "How might we improve user engagement?"
        insights = ["Users need better engagement", "Low engagement is a problem"]
        metrics = ["Engagement rate (%)"] 
        jtbds = ["Help users stay engaged"]
        
        score = generator._calculate_relevance_score(question, insights, metrics, jtbds)
        
        # Should be above base score due to keyword matches
        assert isinstance(score, float)
        assert 0.0 <= score <= 10.0
        assert score > 5.0  # Should have bonus points for keyword alignment
    
    def test_fallback_results(self):
        """Test fallback result generation."""
        generator = HMWGenerator()
        
        insights = ["Users struggle with interface"]
        metrics = ["Usability score"]
        jtbds = ["Complete tasks efficiently"] 
        count = 3
        
        results = generator._create_fallback_results(insights, metrics, jtbds, count)
        
        assert "hmw_questions" in results
        assert "relevance_scores" in results
        assert "reasoning" in results
        
        assert len(results["hmw_questions"]) == count
        assert len(results["relevance_scores"]) == count
        assert all(q.startswith("How might we") for q in results["hmw_questions"])
        assert all(0.0 <= score <= 10.0 for score in results["relevance_scores"])
    
    @pytest.mark.asyncio
    async def test_aforward_fallback_functionality(self):
        """Test async forward fallback when DSPy fails."""
        generator = HMWGenerator()
        
        # Test fallback without requiring actual DSPy calls
        result = await generator.aforward(
            insights=["Users need help with interface"],
            metrics=["Success rate"],
            jtbds=["Complete tasks efficiently"],
            count=2
        )
        
        assert "hmw_questions" in result
        assert "relevance_scores" in result
        assert "reasoning" in result
        
        # Should get fallback results
        assert len(result["hmw_questions"]) >= 2
        assert all(q.startswith("How might we") for q in result["hmw_questions"])
        assert all(isinstance(score, (int, float)) and 0.0 <= score <= 10.0 
                  for score in result["relevance_scores"])
    
    def test_context_formatting(self):
        """Test context formatting for generation."""
        request = GenerateHMWRequest(
            context={
                'insights': [
                    {'id': 'i1', 'content': 'First insight'},
                    'String insight'
                ],
                'metrics': [
                    {'id': 'm1', 'name': 'Test Metric', 'unit': '%', 'description': 'A test metric'}
                ],
                'jtbds': [
                    {'id': 'j1', 'statement': 'Get work done', 'context': 'At the office'}
                ]
            },
            count=3
        )
        
        formatted = format_context_for_generation(request)
        
        assert 'insights' in formatted
        assert 'metrics' in formatted
        assert 'jtbds' in formatted
        
        assert len(formatted['insights']) == 2
        assert 'First insight' in formatted['insights']
        assert 'String insight' in formatted['insights']
        
        assert len(formatted['metrics']) == 1
        assert 'Test Metric (%)' in formatted['metrics'][0]
        assert 'A test metric' in formatted['metrics'][0]
        
        assert len(formatted['jtbds']) == 1
        assert 'Get work done' in formatted['jtbds'][0]
        assert 'At the office' in formatted['jtbds'][0]
    
    def test_result_formatting(self):
        """Test result formatting for API response."""
        raw_results = {
            "hmw_questions": ["improve this", "enhance that"],
            "relevance_scores": [8.5, 7.0],
            "reasoning": "Test reasoning"
        }
        
        request = GenerateHMWRequest(
            context={
                'insights': [{'id': 'i1', 'content': 'Test insight'}],
                'metrics': [{'id': 'm1', 'name': 'Test metric'}],
                'jtbds': [{'id': 'j1', 'statement': 'Test JTBD'}]
            }
        )
        
        results = format_generation_results(raw_results, request)
        
        assert len(results) == 2
        assert all(isinstance(r, HMWResult) for r in results)
        assert all(r.question.startswith("How might we") for r in results)
        assert all(0.0 <= r.score <= 10.0 for r in results)
        assert all(r.source_references is not None for r in results)