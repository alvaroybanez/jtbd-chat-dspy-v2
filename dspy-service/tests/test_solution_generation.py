"""
Test suite for Solution Generation module.

Tests the DSPy-powered solution generation with intelligent metric assignment,
scoring, and fallback mechanisms.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict, Any

from dspy_modules.solution_generator import (
    SolutionGenerator,
    format_context_for_solution_generation,
    format_solution_results
)
from models.requests import CreateSolutionsRequest, HMWItem
from models.responses import SolutionResult, SourceReferences


# Module-level fixtures available to all test classes
@pytest.fixture
def sample_context():
    """Sample context data for testing."""
    return {
        'insights': [
            {'id': 'insight_1', 'content': 'Users struggle with complex workflows'},
            {'id': 'insight_2', 'content': 'Mobile usage is increasing rapidly'}
        ],
        'metrics': [
            {'id': 'metric_1', 'name': 'User Engagement', 'description': 'Daily active users', 'unit': 'count'},
            {'id': 'metric_2', 'name': 'Conversion Rate', 'description': 'Purchase completion rate', 'unit': 'percentage'}
        ],
        'jtbds': [
            {'id': 'jtbd_1', 'statement': 'Help users complete tasks efficiently'},
            {'id': 'jtbd_2', 'statement': 'Enable seamless mobile experience'}
        ]
    }

@pytest.fixture
def sample_hmws():
    """Sample HMW questions for testing."""
    return [
        {'question': 'How might we simplify the user workflow?', 'score': 8.5},
        {'question': 'How might we improve mobile accessibility?', 'score': 7.2}
    ]


class TestSolutionGenerator:
    """Test cases for the SolutionGenerator class."""
    
    @pytest.fixture
    def mock_dspy_result(self):
        """Mock DSPy module result for solution generation."""
        mock_result = MagicMock()
        mock_result.solution_titles = [
            "Streamlined Workflow Interface",
            "Mobile-First Design System"
        ]
        mock_result.solution_descriptions = [
            "Implement a simplified interface that reduces workflow complexity by 60%",
            "Create responsive design patterns optimized for mobile interactions"
        ]
        mock_result.impact_scores = [9, 8]
        mock_result.effort_scores = [6, 4]
        mock_result.assigned_metric_indices = [[0], [1]]
        mock_result.reasoning = "Solutions focused on workflow efficiency and mobile optimization"
        return mock_result
    
    @pytest.fixture
    def mock_summary_result(self):
        """Mock context summary result."""
        mock_result = MagicMock()
        mock_result.summary = "Users need simplified workflows and better mobile experience"
        mock_result.key_themes = ["Workflow simplification", "Mobile optimization"]
        mock_result.opportunity_areas = ["UI/UX improvement", "Mobile responsiveness"]
        return mock_result
    
    def test_solution_normalization_and_scoring(self):
        """Test solution result processing and scoring."""
        generator = SolutionGenerator()
        
        # Mock DSPy result
        mock_result = MagicMock()
        mock_result.solution_titles = ["Test Solution"]
        mock_result.solution_descriptions = ["A test solution description"]
        mock_result.impact_scores = [15]  # Out of range score
        mock_result.effort_scores = [-1]  # Out of range score
        mock_result.assigned_metric_indices = [[0]]
        mock_result.reasoning = "Test reasoning"
        
        # Test processing
        result = generator._process_and_score_solutions(
            mock_result,
            hmw_questions=["How might we test?"],
            available_metrics=["Test Metric"],
            context_insights=["Test insight"],
            context_jtbds=["Test JTBD"]
        )
        
        # Verify score clamping
        assert result["impact_scores"][0] == 10  # Clamped from 15 to 10
        assert result["effort_scores"][0] == 1   # Clamped from -1 to 1
        assert result["solution_titles"][0] == "Test Solution"
        assert len(result["assigned_metric_indices"][0]) >= 1  # At least one metric assigned
    
    def test_intelligent_metric_assignment(self):
        """Test intelligent metric assignment based on solution content."""
        generator = SolutionGenerator()
        
        # Test with engagement-related solution
        solution_text = "Improve user engagement through gamification"
        metrics = ["User Engagement Rate", "Conversion Rate", "Revenue Growth"]
        
        assigned_indices = generator._assign_metrics_intelligently(
            solution_text, metrics, []
        )
        
        # Should assign engagement metric (index 0) due to keyword matching
        assert 0 in assigned_indices
        assert len(assigned_indices) >= 1
        
        # Test with conversion-related solution
        solution_text = "Optimize checkout process to increase conversions"
        assigned_indices = generator._assign_metrics_intelligently(
            solution_text, metrics, []
        )
        
        # Should assign conversion metric (index 1)
        assert 1 in assigned_indices
    
    def test_fallback_solution_generation(self):
        """Test fallback solution generation when DSPy fails."""
        generator = SolutionGenerator()
        
        hmw_questions = ["How might we improve user experience?"]
        metrics = ["User Satisfaction"]
        insights = ["Users want faster loading times"]
        jtbds = ["Complete tasks efficiently"]
        
        result = generator._create_fallback_solutions(
            hmw_questions, metrics, insights, jtbds, 3
        )
        
        # Verify fallback structure
        assert len(result["solution_titles"]) == 3
        assert len(result["solution_descriptions"]) == 3
        assert len(result["impact_scores"]) == 3
        assert len(result["effort_scores"]) == 3
        assert len(result["assigned_metric_indices"]) == 3
        
        # Verify score ranges
        for impact in result["impact_scores"]:
            assert 1 <= impact <= 10
        for effort in result["effort_scores"]:
            assert 1 <= effort <= 10
        
        # Verify metric assignment
        for metric_list in result["assigned_metric_indices"]:
            assert len(metric_list) >= 1
    
    @pytest.mark.asyncio
    async def test_async_solution_generation_success(self, mock_dspy_result, mock_summary_result):
        """Test successful async solution generation."""
        generator = SolutionGenerator()
        
        # Mock both context summarizer and solution generator
        with patch.object(generator.context_summarizer, 'acall', new=AsyncMock(return_value=mock_summary_result)) as mock_summarizer, \
             patch.object(generator.solution_generator, 'acall', new=AsyncMock(return_value=mock_dspy_result)) as mock_generator:
            
            result = await generator.aforward(
                hmw_questions=["How might we test async?"],
                available_metrics=["Test Metric"],
                context_insights=["Test insight"],
                context_jtbds=["Test JTBD"],
                count=2
            )
            
            # Verify DSPy calls
            mock_summarizer.assert_called_once()
            mock_generator.assert_called_once()
            
            # Verify result structure
            assert "solution_titles" in result
            assert "solution_descriptions" in result
            assert "impact_scores" in result
            assert "effort_scores" in result
            assert "assigned_metric_indices" in result
            assert "reasoning" in result
    
    @pytest.mark.asyncio
    async def test_async_solution_generation_failure(self):
        """Test async solution generation failure and fallback."""
        generator = SolutionGenerator()
        
        # Mock DSPy failure
        with patch.object(generator.context_summarizer, 'acall', side_effect=Exception("DSPy failed")):
            result = await generator.aforward(
                hmw_questions=["How might we handle failure?"],
                available_metrics=["Error Rate"],
                context_insights=["System errors increase"],
                context_jtbds=["Handle errors gracefully"],
                count=2
            )
            
            # Should return fallback results
            assert "reasoning" in result
            assert "fallback" in result["reasoning"].lower()
            assert len(result["solution_titles"]) == 2
    
    def test_sync_solution_generation_success(self, mock_dspy_result, mock_summary_result):
        """Test successful synchronous solution generation."""
        generator = SolutionGenerator()
        
        # Mock DSPy calls
        with patch.object(generator.context_summarizer, '__call__', return_value=mock_summary_result) as mock_summarizer, \
             patch.object(generator.solution_generator, '__call__', return_value=mock_dspy_result) as mock_generator:
            
            result = generator.forward(
                hmw_questions=["How might we test sync?"],
                available_metrics=["Test Metric"],
                context_insights=["Test insight"],
                context_jtbds=["Test JTBD"],
                count=2
            )
            
            # Verify DSPy calls
            mock_summarizer.assert_called_once()
            mock_generator.assert_called_once()
            
            # Verify result structure
            assert "solution_titles" in result
            assert len(result["solution_titles"]) == 2
    
    def test_sync_solution_generation_failure(self):
        """Test synchronous solution generation failure and fallback."""
        generator = SolutionGenerator()
        
        # Mock DSPy failure
        with patch.object(generator.context_summarizer, '__call__', side_effect=Exception("DSPy failed")):
            result = generator.forward(
                hmw_questions=["How might we handle sync failure?"],
                available_metrics=["Error Rate"],
                context_insights=["Sync errors occur"],
                context_jtbds=["Ensure reliability"],
                count=2
            )
            
            # Should return fallback results
            assert "reasoning" in result
            assert "fallback" in result["reasoning"].lower()
    
    def test_empty_context_handling(self):
        """Test handling of empty or minimal context."""
        generator = SolutionGenerator()
        
        # Test with minimal context
        result = generator._create_fallback_solutions(
            hmw_questions=[],
            available_metrics=[],
            context_insights=[],
            context_jtbds=[],
            count=2
        )
        
        # Should still generate solutions
        assert len(result["solution_titles"]) == 2
        assert all("Strategic Solution" in title for title in result["solution_titles"])
        
        # Should have default metric assignment
        for metric_list in result["assigned_metric_indices"]:
            assert metric_list == [0]  # Default fallback
    
    def test_metric_assignment_edge_cases(self):
        """Test metric assignment with edge cases."""
        generator = SolutionGenerator()
        
        # Test with no metrics
        result = generator._assign_metrics_intelligently("test solution", [], [])
        assert result == [0]  # Should default to [0]
        
        # Test with invalid DSPy indices
        result = generator._assign_metrics_intelligently(
            "test solution", 
            ["Metric 1", "Metric 2"], 
            [5, -1, 10]  # All invalid indices
        )
        assert len(result) >= 1
        assert all(0 <= idx < 2 for idx in result)  # All indices should be valid
        
        # Test with valid DSPy indices
        result = generator._assign_metrics_intelligently(
            "test solution",
            ["Metric 1", "Metric 2", "Metric 3"],
            [1, 2]  # Valid indices
        )
        assert result == [1, 2]  # Should use DSPy provided indices


class TestSolutionGenerationUtilities:
    """Test cases for solution generation utility functions."""
    
    def test_format_context_for_solution_generation(self, sample_context, sample_hmws):
        """Test context formatting for DSPy input."""
        # Create HMW items with proper IDs
        hmw_items = []
        for i, hmw in enumerate(sample_hmws):
            hmw_items.append(HMWItem(id=f"hmw_{i+1}", **hmw))
        
        request = CreateSolutionsRequest(
            hmws=hmw_items,
            context=sample_context,
            count=5
        )
        
        formatted = format_context_for_solution_generation(request)
        
        # Verify formatted structure
        assert "hmw_questions" in formatted
        assert "available_metrics" in formatted
        assert "metric_ids" in formatted
        assert "context_insights" in formatted
        assert "context_jtbds" in formatted
        
        # Verify content extraction
        assert len(formatted["hmw_questions"]) == 2
        assert "How might we" in formatted["hmw_questions"][0]
        assert len(formatted["available_metrics"]) == 2
        assert "User Engagement" in formatted["available_metrics"][0]
    
    def test_format_solution_results(self, sample_context):
        """Test solution result formatting."""
        raw_results = {
            "solution_titles": ["Solution A", "Solution B"],
            "solution_descriptions": ["Description A", "Description B"],
            "impact_scores": [8, 7],
            "effort_scores": [4, 6],
            "assigned_metric_indices": [[0], [1]],
            "reasoning": "Test reasoning"
        }
        
        request = CreateSolutionsRequest(
            hmws=[],
            context=sample_context,
            count=2
        )
        
        metric_ids = ["metric_1", "metric_2"]
        
        results = format_solution_results(raw_results, request, metric_ids)
        
        # Verify result structure
        assert len(results) == 2
        assert isinstance(results[0], SolutionResult)
        
        # Verify solution properties
        solution = results[0]
        assert solution.title == "Solution A"
        assert solution.description == "Description A"
        assert solution.impact_score == 8
        assert solution.effort_score == 4
        assert solution.final_score == 2.0  # 8/4 = 2.0
        assert "metric_1" in solution.assigned_metrics
        
        # Verify sorting by final score (should be descending)
        assert results[0].final_score >= results[1].final_score
    
    def test_format_solution_results_with_missing_data(self):
        """Test solution result formatting with missing or incomplete data."""
        raw_results = {
            "solution_titles": ["Solution A"],  # Only one title
            "solution_descriptions": [],  # No descriptions
            "impact_scores": [15, -5],  # Out of range scores
            "effort_scores": [4],  # Missing effort score
            "assigned_metric_indices": [[]],  # Empty metric assignment
            "reasoning": "Incomplete test data"
        }
        
        # Create a valid request with at least one HMW
        hmw_item = HMWItem(
            id='hmw_1', 
            question='How might we test missing data?',
            score=5.0
        )
        
        request = CreateSolutionsRequest(
            hmws=[hmw_item],
            context={
                'insights': [{'id': 'i1', 'content': 'Test insight'}],
                'metrics': [{'id': 'm1', 'name': 'Test Metric', 'unit': 'count'}],
                'jtbds': [{'id': 'j1', 'statement': 'Test JTBD'}]
            },
            count=2
        )
        
        metric_ids = ["m1"]
        
        results = format_solution_results(raw_results, request, metric_ids)
        
        # Should handle missing data gracefully
        assert len(results) == 1  # Only create results for available titles
        
        solution = results[0]
        assert solution.title == "Solution A"
        assert len(solution.description) > 0  # Should have default description
        assert 1 <= solution.impact_score <= 10  # Should clamp out-of-range scores
        assert 1 <= solution.effort_score <= 10  # Should handle missing scores
        assert len(solution.assigned_metrics) >= 1  # Should have fallback metric assignment
        

if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])