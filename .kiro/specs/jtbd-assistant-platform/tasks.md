# Implementation Plan

- [ ] 1. Set up database schema and core infrastructure
  - Create Supabase database tables with proper relationships and constraints
  - Add simple vector search RPC function
  - Create LLM traces table for observability
  - Enable pgvector extension and create vector indexes
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 2. Implement document processing with caching
  - Create document upload handler with file size and format validation
  - Implement content chunking with overlap for vector search
  - Add cached embedding generation to reduce latency and cost
  - Build insight extraction using LLM wrapper with trace logging
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 3. Build vector search and chat exploration
  - Implement vector search using Supabase RPC
  - Create chat interface for document exploration and context building
  - Add structured response display with selection buttons for insights, JTBDs, and metrics
  - Implement Streamlit session state management for user context
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 4. Create manual JTBD and metric input
  - Build sidebar forms for manual JTBD creation with embedding generation
  - Implement metric creation interface with current/target values
  - Add validation and storage
  - Ensure created items are available for chat exploration and selection
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Implement HMW generation with fallback
  - Create HMW generation function using LLM wrapper with trace logging
  - Add optional DSPy integration with graceful fallback to OpenAI
  - Implement context-based prompt building from selected insights, JTBDs, and metrics
  - Store generated HMWs with relationship tracking to source context
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 6. Build solution creation with intelligent metric assignment
  - Implement solution generation from selected HMWs using LLM wrapper
  - Add per-session metric fallback instead of global default
  - Create solution scoring algorithm (Impact × 0.6 + (10 - Effort) × 0.4)
  - Store solutions with relationship tracking and automatic sorting by score
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 7. Add error handling and guardrails
  - Implement structured error responses with retry/fallback actions
  - Add token budget enforcement with text truncation utilities
  - Create graceful fallback for DSPy unavailability
  - Add file size validation and format checking with appropriate error messages
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Implement basic session management
  - Create Streamlit session state management for user context
  - Add basic data persistence and retrieval
  - Implement simple session initialization
  - _Requirements: 3.1, 3.4, 3.5_

- [ ] 9. Create main Streamlit application
  - Build main UI with sidebar for uploads and manual input
  - Implement chat interface with message history and structured responses
  - Add session state management and context building
  - Create demo mode banner and reset functionality
  - Wire together all components into cohesive user experience
  - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 10. Add configuration and deployment setup
  - Create Streamlit secrets configuration template
  - Add environment variable setup for API keys
  - Implement client initialization with proper error handling
  - Create basic deployment configuration
  - _Requirements: Basic setup and configuration_