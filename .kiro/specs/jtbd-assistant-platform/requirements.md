# Requirements Document

## Introduction

The JTBD Assistant Platform is a single-user AI-powered Streamlit application that transforms customer research into actionable insights, How Might We (HMW) questions, and prioritized solutions through a conversational chat interface. The platform uses OpenAI for intelligent content generation with optional DSPy enhancement and Supabase for document storage and vector search.

## Requirements

### Requirement 1

**User Story:** As a user, I want to upload research documents, so that they are automatically analyzed and made available for exploration.

#### Acceptance Criteria

1. WHEN I upload a text document (.md or .txt format) THEN the system SHALL automatically chunk, embed, and store the content in Supabase with pgvector
2. WHEN a document is uploaded THEN the system SHALL automatically analyze and extract insights without user intervention
3. IF a document exceeds 1MB THEN the system SHALL return a FILE_TOO_LARGE error
4. IF a document is not .md or .txt format THEN the system SHALL reject the upload with an appropriate error
5. WHEN content is processed THEN the system SHALL generate 1536-dimension embeddings for vector search
6. WHEN analysis completes THEN insights SHALL be stored and made available for chat exploration

### Requirement 2

**User Story:** As a user, I want to manually create JTBDs and metrics, so that I can define specific jobs-to-be-done and measurable outcomes for my product.

#### Acceptance Criteria

1. WHEN I create a JTBD THEN the system SHALL store the statement, context, and outcome with embeddings
2. WHEN I create a metric THEN the system SHALL store the name, current value, target value, and unit
3. WHEN JTBDs are created THEN they SHALL be available for retrieval in chat exploration
4. WHEN metrics are created THEN they SHALL be available for retrieval in chat exploration
5. WHEN JTBDs and metrics are stored THEN they SHALL be indexed for efficient retrieval

### Requirement 3

**User Story:** As a user, I want to explore my documents through chat and retrieve relevant insights, metrics, and JTBDs, so that I can build context for HMW generation.

#### Acceptance Criteria

1. WHEN I send a chat message THEN the system SHALL retrieve relevant context using pgvector similarity search
2. WHEN retrieving context THEN the system SHALL limit results to 100 items with similarity ≥ 0.7
3. WHEN responding THEN the system SHALL stream responses with retrieved context
4. WHEN I ask for insights THEN the system SHALL retrieve and present existing insights from uploaded documents in the chat interface for selection
5. WHEN I ask for metrics THEN the system SHALL retrieve and present existing metrics in the chat interface for selection
6. WHEN I ask for JTBDs THEN the system SHALL retrieve and present existing JTBDs in the chat interface for selection
7. WHEN insights, metrics, or JTBDs are selected THEN they SHALL be added to my context for HMW generation
8. IF token budget exceeds 4000 tokens THEN the system SHALL truncate context and messages

### Requirement 4

**User Story:** As a user, I want to generate How Might We questions from my selected context, so that I can systematically explore solution opportunities.

#### Acceptance Criteria

1. WHEN I have selected insights, metrics, and/or JTBDs THEN I SHALL be able to request HMW generation
2. WHEN I request HMW generation THEN the system SHALL generate HMWs using OpenAI with optional DSPy enhancement
3. WHEN HMWs are generated THEN each question SHALL start with "How might we"
4. WHEN HMWs are generated THEN the system SHALL present them in the chat interface for selection
5. WHEN HMWs are selected THEN the system SHALL persist them with references to source JTBDs, metrics, and insights
6. IF DSPy is unavailable THEN the system SHALL generate HMWs using OpenAI directly
7. WHEN HMW generation completes THEN the system SHALL return questions with priority scores and source references

### Requirement 5

**User Story:** As a user, I want to create solutions from selected HMWs, so that I can generate prioritized, actionable solutions.

#### Acceptance Criteria

1. WHEN I have selected HMWs from the chat interface THEN I SHALL be able to request solution creation
2. WHEN I request solution creation THEN the system SHALL generate solutions using OpenAI with optional DSPy enhancement
3. WHEN solutions are generated THEN each solution SHALL include title, description, customer_benefit, user_journey, impact_score, effort_score, and final_score
4. WHEN solutions are generated THEN they SHALL be presented in the chat interface sorted by final_score
5. WHEN solutions are persisted THEN they SHALL be linked to their source HMWs and metrics
6. IF DSPy is unavailable THEN the system SHALL generate solutions using OpenAI directly

### Requirement 6

**User Story:** As a user, I want the system to handle errors gracefully, so that I can continue working even when components are unavailable.

#### Acceptance Criteria

1. WHEN DSPy is unavailable THEN the system SHALL fall back to OpenAI direct generation
2. WHEN errors occur THEN the system SHALL return structured error responses with code, message, and action
3. WHEN OpenAI API fails THEN the system SHALL retry with exponential backoff
4. WHEN database operations fail THEN the system SHALL provide clear error messages

### Requirement 7

**User Story:** As a user, I want vector search capabilities, so that I can find relevant content based on semantic similarity.

#### Acceptance Criteria

1. WHEN performing vector search THEN the system SHALL use pgvector with ivfflat indexes
2. WHEN searching document chunks THEN the system SHALL use a simple search function
3. WHEN vector search executes THEN it SHALL return results with similarity scores
4. WHEN embedding content THEN the system SHALL use consistent 1536-dimension vectors
5. WHEN storing embeddings THEN the system SHALL create appropriate indexes for performance