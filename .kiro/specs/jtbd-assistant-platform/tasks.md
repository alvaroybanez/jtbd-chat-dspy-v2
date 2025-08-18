# Implementation Plan

- [x] 1. Set up project structure and core configuration
  - Create TypeScript Next.js project with AI SDK v5 dependencies
  - Create Python FastAPI project with DSPy dependencies
  - Set up Supabase project with pgvector extension
  - Configure environment variables for both services
  - _Requirements: 8.5_

- [x] 2. Implement Supabase database schema and functions
  - Create database tables with pgvector columns for embeddings
  - Implement vector search RPC function for similarity search
  - Create database indexes for optimal vector search performance
  - Seed default metric for fallback scenarios
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3. Build TypeScript core utilities and services
- [x] 3.1 Create configuration and database connection utilities
  - Implement centralized configuration management
  - Set up Supabase client singleton
  - Create error handling utilities with standard error format
  - _Requirements: 8.5, 6.3_

- [x] 3.2 Implement embedding and vector search functionality
  - Create OpenAI embedding service using AI SDK v5
  - Build vector similarity search with pgvector integration
  - Implement text chunking with overlap for document processing
  - _Requirements: 1.5, 7.1, 7.2, 7.3_

- [x] 3.3 Build chat intent detection and retrieval services
  - Implement keyword-based intent detection logic
  - Create context retrieval service for insights, metrics, and JTBDs
  - Build token budget management and truncation utilities
  - _Requirements: 3.1, 3.2, 3.3, 3.9_

- [x] 4. Implement document upload and processing pipeline
- [x] 4.1 Create document upload API endpoint
  - Validate file format (.md, .txt only) and size limits
  - Process text content and generate content hash
  - Store document metadata in database
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 4.2 Build document chunking and embedding pipeline
  - Chunk document content with appropriate overlap
  - Generate embeddings for all chunks using OpenAI
  - Store chunks with embeddings in database
  - _Requirements: 1.1, 1.5_

- [x] 4.3 Implement automatic insight extraction
  - Extract insights from document chunks using AI
  - Generate embeddings for insights
  - Store insights with document relationships
  - _Requirements: 1.2, 1.6_

- [x] 5. Create JTBD and metrics management APIs
- [x] 5.1 Build JTBD creation endpoint
  - Validate JTBD statement and optional context
  - Generate embeddings for JTBD content
  - Store JTBD with user relationship
  - _Requirements: 2.1, 2.3, 2.5_

- [x] 5.2 Build metrics creation endpoint
  - Validate metric data (name, values, unit)
  - Store metric with user relationship
  - Make metrics available for chat retrieval
  - _Requirements: 2.2, 2.4, 2.5_

- [x] 6. Implement Python DSPy intelligence services
- [x] 6.1 Set up FastAPI application with authentication
  - Create FastAPI app with x-api-key validation
  - Implement request/response models using Pydantic
  - Configure DSPy with OpenAI integration
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 6.2 Build HMW generation endpoint with DSPy
  - Create DSPy signature for HMW generation
  - Implement HMW normalization to ensure "How might we" prefix
  - Generate scored HMWs with source references
  - _Requirements: 4.2, 4.3, 4.7_

- [x] 6.3 Build solution creation endpoint with intelligent metric assignment
  - Create DSPy signature for solution generation
  - Implement intelligent metric selection logic
  - Generate solutions with impact/effort scoring
  - Calculate final scores and ensure metric assignment
  - _Requirements: 5.2, 5.3, 5.4, 5.6_

- [x] 7. Create TypeScript fallback generation services
- [x] 7.1 Implement HMW fallback generation
  - Create local HMW generation using OpenAI direct API
  - Ensure "How might we" prefix normalization
  - Generate fallback HMWs when DSPy is unavailable
  - _Requirements: 4.6, 6.2_

- [x] 7.2 Implement solution fallback generation
  - Create local solution generation using OpenAI direct API
  - Implement fallback metric assignment logic
  - Generate solutions with required scoring when DSPy fails
  - _Requirements: 5.7, 6.2, 6.4, 6.5_

- [ ] 8. Implement chat persistence layer
- [ ] 8.1 Create chat session management service
  - Implement chat creation with initial context
  - Build chat loading with message history
  - Add chat archival and cleanup logic
  - _Requirements: Chat state persistence, context tracking_

- [x] 8.2 Build message persistence pipeline
  - Store messages with role, content, and metadata
  - Track processing time and token usage
  - Record context items used per message
  - Capture intent detection results
  - _Requirements: Complete message audit trail_

- [ ] 8.3 Implement context management system
  - Build context selection persistence
  - Implement context loading for chat resumption
  - Add context update notifications
  - Create context usage tracking
  - _Requirements: Stateful context across sessions_

- [ ] 8.4 Create chat history API endpoints
  - Build chat listing with pagination
  - Implement chat session retrieval
  - Add context update endpoint
  - Create chat archival endpoint
  - _Requirements: Full chat CRUD operations_

- [ ] 9. Build chat orchestration and streaming API
- [ ] 9.1 Create main chat endpoint with intent routing
  - Implement POST /api/v1/chat with Server-Sent Events
  - Route requests based on detected intent
  - Handle general exploration with streaming responses
  - Integrate with chat persistence for message storage
  - _Requirements: 3.1, 3.4, 8.1, 8.2_

- [ ] 9.2 Implement context retrieval and picker responses
  - Build insights retrieval and presentation in chat
  - Build metrics retrieval and presentation in chat
  - Build JTBDs retrieval and presentation in chat
  - Return picker interfaces for user selection
  - _Requirements: 3.5, 3.6, 3.7_

- [ ] 9.3 Integrate HMW generation with chat interface
  - Call Python DSPy service for HMW generation
  - Handle DSPy failures with fallback generation
  - Present generated HMWs in chat for user selection
  - Persist selected HMWs with relationship data
  - _Requirements: 4.1, 4.4, 4.5, 4.6_

- [ ] 9.4 Integrate solution creation with chat interface
  - Call Python DSPy service for solution creation
  - Handle DSPy failures with fallback generation
  - Present solutions sorted by final score
  - Persist solutions with all required relationships
  - _Requirements: 5.1, 5.5, 5.6, 5.7_

- [ ] 10. Implement Python-TypeScript service communication
- [ ] 10.1 Build TypeScript client for Python intelligence APIs
  - Create HTTP client with timeout handling
  - Implement authentication with x-api-key header
  - Handle connection failures and trigger fallbacks
  - _Requirements: 6.1, 6.2, 9.1, 9.2_

- [ ] 10.2 Add comprehensive error handling and monitoring
  - Implement structured error responses across all endpoints
  - Add timeout detection and fallback activation
  - Create logging for debugging and monitoring
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 11. Build data persistence and relationship management
- [ ] 11.1 Implement HMW persistence with relationships
  - Store HMWs with arrays of related JTBD, metric, and insight IDs
  - Maintain relationship integrity during persistence
  - Support efficient relationship queries
  - _Requirements: 9.3, 10.1, 10.2_

- [ ] 11.2 Implement solution persistence with metric validation
  - Store solutions with all required relationship arrays
  - Validate metric_ids array contains at least one ID
  - Ensure fallback metric assignment when needed
  - _Requirements: 9.4, 10.1, 10.2, 6.4, 6.5_

- [ ] 12. Create comprehensive test suite
- [ ] 12.1 Write unit tests for core utilities
  - Test intent detection logic with various inputs
  - Test document chunking and embedding generation
  - Test fallback generation when DSPy is unavailable
  - Test vector search and similarity calculations
  - Test chat persistence and context management
  - _Requirements: All core functionality_

- [ ] 12.2 Write integration tests for service communication
  - Test TypeScript to Python API communication
  - Test authentication and timeout handling
  - Test fallback activation on service failures
  - Test database operations and constraint validation
  - Test chat session persistence and recovery
  - _Requirements: 6.1, 6.2, 8.1, 8.2, 9.1, 9.2, 10.1, 10.2_

- [ ] 12.3 Write end-to-end workflow tests
  - Test complete document upload to insight generation flow
  - Test chat exploration to context building flow
  - Test HMW generation and selection flow
  - Test solution creation and persistence flow
  - Test chat session continuity and recovery
  - _Requirements: All user workflow requirements_