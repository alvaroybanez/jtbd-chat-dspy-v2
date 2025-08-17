# Requirements Document

## Introduction

The JTBD Assistant Platform is an AI-powered system that transforms customer research into actionable insights, How Might We (HMW) questions, and prioritized solutions through a conversational chat interface. The platform combines TypeScript orchestration with Python-based DSPy intelligence to reduce the time from insight to solution by 99%, targeting product teams managing over 100 research artifacts.

## Requirements

### Requirement 1

**User Story:** As a product team member, I want to upload research documents, so that they are automatically analyzed and made available for exploration.

#### Acceptance Criteria

1. WHEN a user uploads a text document (.md or .txt format) THEN the system SHALL automatically chunk, embed, and store the content in Supabase with pgvector
2. WHEN a document is uploaded THEN the system SHALL automatically analyze and extract insights without user intervention
3. IF a document exceeds 1MB THEN the system SHALL return a FILE_TOO_LARGE error
4. IF a document is not .md or .txt format THEN the system SHALL reject the upload with an appropriate error
5. WHEN content is processed THEN the system SHALL generate 1536-dimension embeddings for vector search
6. WHEN analysis completes THEN insights SHALL be stored and made available for chat exploration

### Requirement 2

**User Story:** As a product team member, I want to manually create JTBDs and metrics, so that I can define specific jobs-to-be-done and measurable outcomes for my product.

#### Acceptance Criteria

1. WHEN a user creates a JTBD THEN the system SHALL store the statement, context, and outcome with embeddings
2. WHEN a user creates a metric THEN the system SHALL store the name, current value, target value, and unit
3. WHEN JTBDs are created THEN they SHALL be available for retrieval in chat exploration
4. WHEN metrics are created THEN they SHALL be available for retrieval in chat exploration
5. WHEN JTBDs and metrics are stored THEN they SHALL be indexed for efficient retrieval

### Requirement 3

**User Story:** As a product team member, I want to explore my documents through chat and retrieve relevant insights, metrics, and JTBDs, so that I can build context for HMW generation.

#### Acceptance Criteria

1. WHEN a user sends a chat message THEN the system SHALL operate in exploration mode using the base model
2. WHEN in exploration mode THEN the system SHALL retrieve relevant context using pgvector similarity search
3. WHEN retrieving context THEN the system SHALL limit results to 100 items with similarity ≥ 0.7
4. WHEN responding THEN the system SHALL stream responses using AI SDK with retrieved context
5. WHEN the user asks for insights THEN the system SHALL retrieve and present existing insights from uploaded documents in the chat interface for selection
6. WHEN the user asks for metrics THEN the system SHALL retrieve and present existing user-created metrics in the chat interface for selection
7. WHEN the user asks for JTBDs THEN the system SHALL retrieve and present existing user-created JTBDs in the chat interface for selection
8. WHEN insights, metrics, or JTBDs are selected THEN they SHALL be added to the user's context for HMW generation
9. IF token budget exceeds 4000 tokens THEN the system SHALL truncate context and messages

### Requirement 4

**User Story:** As a product team member, I want to generate How Might We questions from my selected context, so that I can systematically explore solution opportunities.

#### Acceptance Criteria

1. WHEN a user has selected insights, metrics, and/or JTBDs THEN they SHALL be able to request HMW generation
2. WHEN a user requests HMW generation THEN the system SHALL call the Python DSPy generate_hmw endpoint with selected context
3. WHEN DSPy generates HMWs THEN each question SHALL start with "How might we"
4. WHEN HMWs are generated THEN the system SHALL present them in the chat interface for user selection
5. WHEN HMWs are selected THEN the system SHALL persist them with references to source JTBDs, metrics, and insights
6. IF DSPy is unavailable THEN the system SHALL generate HMWs using local fallback prompts
7. WHEN HMW generation completes THEN the system SHALL return questions with scores and source references

### Requirement 5

**User Story:** As a product team member, I want to create solutions from selected HMWs, so that I can generate prioritized, actionable solutions with intelligent metric assignment.

#### Acceptance Criteria

1. WHEN a user has selected HMWs from the chat interface THEN they SHALL be able to request solution creation
2. WHEN a user requests solution creation THEN the system SHALL call the Python DSPy create_solutions endpoint with selected HMWs
3. WHEN no metric is provided THEN DSPy SHALL intelligently select an appropriate metric from available options
4. WHEN solutions are generated THEN each solution SHALL include title, description, customer_benefit, customer_journey, impact_score, effort_score, and final_score
5. WHEN solutions are generated THEN they SHALL be presented in the chat interface sorted by final_score
6. WHEN solutions are persisted THEN metric_ids array SHALL contain at least one metric ID
7. IF DSPy is unavailable THEN the system SHALL generate solutions locally and assign a fallback metric_id

### Requirement 6

**User Story:** As a product team member, I want the system to handle errors gracefully, so that I can continue working even when components are unavailable.

#### Acceptance Criteria

1. WHEN Python DSPy endpoints timeout after 30 seconds THEN the system SHALL trigger fallback generation
2. WHEN DSPy is unreachable THEN the system SHALL return DSPY_MODULE_ERROR and use local generation
3. WHEN errors occur THEN the system SHALL return structured error responses with code, message, and action
4. WHEN fallback solutions are generated THEN they SHALL still satisfy database constraints
5. IF no metrics exist for fallback THEN the system SHALL use a seeded default metric UUID

### Requirement 7

**User Story:** As a product team member, I want vector search capabilities, so that I can find relevant content based on semantic similarity.

#### Acceptance Criteria

1. WHEN performing vector search THEN the system SHALL use pgvector with ivfflat indexes
2. WHEN searching document chunks THEN the system SHALL use the search_similar_chunks RPC function
3. WHEN vector search executes THEN it SHALL return results with similarity scores
4. WHEN embedding content THEN the system SHALL use consistent 1536-dimension vectors
5. WHEN storing embeddings THEN the system SHALL create appropriate indexes for performance

### Requirement 8

**User Story:** As a system administrator, I want secure service-to-service communication, so that internal API calls are authenticated and protected.

#### Acceptance Criteria

1. WHEN TypeScript calls Python endpoints THEN it SHALL include x-api-key header authentication
2. WHEN Python receives requests THEN it SHALL validate the static API key
3. WHEN services communicate THEN they SHALL use HTTPS in production environments
4. WHEN authentication fails THEN the system SHALL return appropriate error responses
5. WHEN configuring services THEN API keys SHALL be environment-configurable

### Requirement 9

**User Story:** As a product team member, I want the system to maintain data relationships, so that I can trace solutions back to their source HMWs, metrics, and insights.

#### Acceptance Criteria

1. WHEN storing HMWs THEN the system SHALL maintain arrays of jtbd_ids, metric_ids, and insight_ids
2. WHEN storing solutions THEN the system SHALL maintain arrays of hmw_ids, metric_ids, insight_ids, and jtbd_ids
3. WHEN persisting relationships THEN arrays SHALL default to empty rather than null
4. WHEN solutions are created THEN metric_ids array SHALL be validated to contain at least one ID
5. WHEN querying related data THEN the system SHALL support efficient relationship traversal