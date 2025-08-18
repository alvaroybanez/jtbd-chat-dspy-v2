"""
DSPy Signatures for the JTBD Intelligence Service.

This module defines DSPy signatures for HMW generation and solution creation
following DSPy best practices with proper input/output field definitions.
"""

import dspy
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class HMWGenerationSignature(dspy.Signature):
    """Generate How Might We questions from provided context."""
    
    # Input fields with descriptions for better LM understanding
    context_summary: str = dspy.InputField(
        desc="Summary of insights, metrics, and JTBDs provided as context"
    )
    insights: List[str] = dspy.InputField(
        desc="Key insights from user research and data analysis"
    )
    metrics: List[str] = dspy.InputField(
        desc="Available metrics that solutions could impact"
    )
    jtbds: List[str] = dspy.InputField(
        desc="Jobs-to-be-Done statements representing user goals"
    )
    count: int = dspy.InputField(
        desc="Number of HMW questions to generate (1-20)"
    )
    
    # Output fields with constraints
    hmw_questions: List[str] = dspy.OutputField(
        desc="Generated 'How might we...' questions that are specific, actionable, and relevant"
    )
    relevance_scores: List[float] = dspy.OutputField(
        desc="Relevance scores for each question from 0.0 to 10.0"
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of the generation approach and key considerations"
    )


class SolutionGenerationSignature(dspy.Signature):
    """Generate prioritized solutions with intelligent metric assignment."""
    
    # Input fields
    hmw_questions: List[str] = dspy.InputField(
        desc="Selected How Might We questions to generate solutions for"
    )
    available_metrics: List[str] = dspy.InputField(
        desc="Available metrics that can be assigned to solutions"
    )
    context_insights: List[str] = dspy.InputField(
        desc="Supporting insights that inform solution design"
    )
    context_jtbds: List[str] = dspy.InputField(
        desc="Related Jobs-to-be-Done that solutions should address"
    )
    count: int = dspy.InputField(
        desc="Number of solutions to generate (1-20)"
    )
    
    # Output fields
    solution_titles: List[str] = dspy.OutputField(
        desc="Clear, concise titles for each solution (5-100 characters)"
    )
    solution_descriptions: List[str] = dspy.OutputField(
        desc="Detailed descriptions of each solution (20-1000 characters)"
    )
    impact_scores: List[int] = dspy.OutputField(
        desc="Impact scores from 1-10 (10 = high impact)"
    )
    effort_scores: List[int] = dspy.OutputField(
        desc="Effort scores from 1-10 (10 = high effort)"
    )
    assigned_metric_indices: List[List[int]] = dspy.OutputField(
        desc="Indices of metrics each solution would impact (at least 1 per solution)"
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of scoring rationale and metric assignments"
    )


class ContextSummarySignature(dspy.Signature):
    """Create a concise summary of provided context for better processing."""
    
    insights: List[str] = dspy.InputField(
        desc="Raw insights from user research"
    )
    metrics: List[str] = dspy.InputField(
        desc="Available metrics with names and descriptions"
    )
    jtbds: List[str] = dspy.InputField(
        desc="Jobs-to-be-Done statements"
    )
    
    summary: str = dspy.OutputField(
        desc="Concise summary highlighting key themes and opportunities (100-500 words)"
    )
    key_themes: List[str] = dspy.OutputField(
        desc="3-5 key themes identified from the context"
    )
    opportunity_areas: List[str] = dspy.OutputField(
        desc="3-5 specific opportunity areas for solutions"
    )