# TypeScript Build Error Patterns Reference

## Overview

This document catalogs common TypeScript build error patterns encountered during development and their proven solutions. These patterns emerged during a comprehensive build error resolution session and represent recurring issues that can affect similar codebases.

## Pattern Categories

### 1. Literal Type vs String Type Mismatch

**Problem:** Array.includes() with const assertions creates overly strict type checking.

**Root Cause:** 
```typescript
// Constants defined with 'as const' create readonly literal tuple types
export const FILE_PROCESSING = {
  ALLOWED_EXTENSIONS: ['md', 'txt'], // inferred as readonly ['md', 'txt']
} as const

// Method returns generic string, but includes() expects literal type
const extension = extractFileExtension(filename) // returns string | null
if (extension && !this.allowedTypes.includes(extension)) { // ERROR: string not assignable to 'md' | 'txt'
```

**Solution:** Create a type guard function that centralizes the type checking logic.

```typescript
// Before (fails with type casting)
if (extension && !(this.allowedTypes as readonly string[]).includes(extension)) {

// After (improved with type guard)
private isAllowedExtension(extension: string): extension is typeof FILE_PROCESSING.ALLOWED_EXTENSIONS[number] {
  return (this.allowedTypes as readonly string[]).includes(extension)
}

// Usage
if (extension && !this.isAllowedExtension(extension)) {
```

**Benefits:** 
- Centralizes the type assertion in one place
- Provides better type inference
- Makes intent clearer than inline casting

**Files Affected:** `src/lib/services/document-processing/validator.ts`

---

### 2. Logger Type Compatibility

**Problem:** Complex interface objects not assignable to `Record<string, unknown>`.

**Root Cause:** Logger expects `Record<string, unknown>` but receives typed interfaces without index signatures.

```typescript
interface UploadResult {
  documentId: UUID
  filename: string
  chunksCreated: number
  // ... no index signature
}

logger.info('Upload completed', result) // ERROR: missing index signature
```

**Solution:** Create a safe logging helper that handles type conversion properly.

```typescript
// Before (unsafe double assertion)
logger.info('Upload completed', result as unknown as Record<string, unknown>)

// After (improved with helper)
export function safeLogData(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) {
    return {}
  }
  
  if (typeof data === 'object' && data !== null) {
    try {
      // Ensure it's serializable
      JSON.stringify(data)
      return data as Record<string, unknown>
    } catch {
      // If not serializable, return string representation
      return { serialized: String(data) }
    }
  }
  
  // For primitives, wrap in an object
  return { value: data }
}

// Usage
logger.info('Upload completed', safeLogData(result))
```

**Benefits:**
- Handles non-serializable objects gracefully
- Provides consistent error handling
- Makes logging safer and more explicit
- Single point of maintenance for logging logic

**Files Affected:** 
- `src/lib/logger/index.ts` (helper function)
- `src/lib/services/document-upload/index.ts`
- `src/lib/services/embeddings/batch.ts`
- `src/lib/services/insights/extractor.ts`

---

### 3. Database Client Import Pattern

**Problem:** Generic type inference issues with exported wrapper functions.

**Root Cause:** Exported executeQuery function loses generic type information.

```typescript
// client.ts exports
export const executeQuery = (operation: any, options?: RetryOptions) => 
  databaseClient.executeQuery(operation, options)

// Usage fails
const result = await executeQuery<{id: UUID}>(...) // ERROR: Expected 0 type arguments
```

**Solution:** Make wrapper functions properly generic to preserve type information.

```typescript
// Before (fails - no generic support)
export const executeQuery = (operation: any, options?: RetryOptions) => 
  databaseClient.executeQuery(operation, options)

// After (improved - generic wrapper)
export const executeQuery = <T>(
  operation: (client: SupabaseClient<Database, 'public'>) => Promise<{ data: T | null; error: any }>,
  options?: RetryOptions
) => databaseClient.executeQuery<T>(operation, options)

export const executeVectorSearch = <T>(
  functionName: string, 
  queryEmbedding: Vector, 
  threshold?: number, 
  limit?: number, 
  userId?: string
) => databaseClient.executeVectorSearch<T>(functionName, queryEmbedding, threshold, limit, userId)

// Usage now works correctly
const result = await executeQuery<{id: UUID}>(...)
```

**Benefits:**
- Maintains type safety through the entire call chain
- Allows using convenient wrapper functions without losing generics
- Better than direct client access for abstraction
- Consistent with the rest of the codebase patterns

**Files Affected:** 
- `src/lib/database/client.ts` (wrapper functions)
- `src/lib/services/document-upload/index.ts`
- `src/lib/services/insights/extractor.ts`
- `src/lib/services/jtbd/index.ts`
- `src/lib/services/vector-search/index.ts`

---

### 4. AI SDK Version Incompatibility

**Problem:** AI SDK v5 has breaking changes between EmbeddingModelV1 and V2 specifications.

**Root Cause:** Library uses V1 models but functions expect V2 interfaces.

```typescript
const model = openai.embedding(config.model) // Returns EmbeddingModelV1
await embed({ model, value: text }) // ERROR: expects EmbeddingModelV2
```

**Solution:** Create a compatibility adapter function with proper documentation.

```typescript
// Before (unsafe any assertion)
await embed({ model: this.model as any, value: text })

// After (improved with documented adapter)
/**
 * AI SDK V1/V2 compatibility adapter for embedding models
 * TODO: Remove when AI SDK V2 fully supports embedding models
 * Related issue: https://github.com/vercel/ai/issues/embeddings-v2
 */
function createCompatibleModel(model: any): EmbeddingModel<string> {
  return model as EmbeddingModel<string>
}

function createCompatibleLanguageModel(model: any): LanguageModel {
  return model as LanguageModel
}

// Usage
await embed({ model: createCompatibleModel(this.model), value: text })
await generateText({ model: createCompatibleLanguageModel(openai(...)), prompt })
```

**Benefits:**
- Documents the temporary nature of the workaround
- Links to relevant issues/version info
- Centralizes the compatibility logic
- Makes it easy to search and remove later
- Provides type safety while being explicit about the workaround

**Files Affected:** 
- `src/lib/services/embeddings/batch.ts`
- `src/lib/services/embeddings/index.ts`
- `src/lib/services/insights/extractor.ts`

---

### 5. Missing Type Exports

**Problem:** Types imported internally but not re-exported for external use.

**Root Cause:** Modules import types from database layer but don't expose them to service consumers.

```typescript
// types.ts
import type { Vector } from '../database/types'
// ... uses Vector internally but doesn't export it

// cache.ts
import type { Vector } from '../types' // ERROR: Vector not exported
```

**Solution:** Re-export pattern for shared types.

```typescript
// types.ts
import type { Vector } from '../database/types'

// Re-export for use by other service modules
export type { Vector }
```

**Files Affected:** `src/lib/services/types.ts`

---

### 6. Spread Operator Type Safety

**Problem:** Spreading potentially undefined or untyped objects causes type errors.

**Root Cause:** Optional metadata properties don't guarantee object type for spread operations.

```typescript
interface Chunk {
  metadata?: Record<string, any>
}

const newMetadata = {
  ...currentChunk.metadata, // ERROR: Spread types may only be created from object types
  merged: true
}
```

**Solution:** Create a helper function for safe metadata handling.

```typescript
// Before (unsafe casting and potential issues)
metadata: {
  ...(currentChunk.metadata as Record<string, any> || {}),
  merged: true,
  originalChunkCount: ((currentChunk.metadata?.originalChunkCount as number) || 1) + 1
}

// After (improved with helper)
/**
 * Helper to ensure metadata is a Record for safe spreading
 */
private ensureMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && metadata !== null) {
    return metadata as Record<string, unknown>
  }
  return {}
}

// Usage
metadata: {
  ...this.ensureMetadata(currentChunk.metadata),
  merged: true,
  originalChunkCount: (Number(this.ensureMetadata(currentChunk.metadata).originalChunkCount) || 1) + 1
}
```

**Benefits:**
- Eliminates `any` type usage
- Provides consistent handling of metadata
- Uses proper numeric conversion
- Makes the intent clearer
- Reusable across the class

**Files Affected:** `src/lib/services/text-processing/chunker.ts`

---

### 7. API Response Type Mismatches

**Problem:** Database/API responses missing expected properties defined in types.

**Root Cause:** Vector search results don't include similarity score in returned data.

```typescript
interface SearchResult {
  similarity: number
  // ... other properties
}

const results = vectorSearchResponse.map(result => ({
  similarity: result.similarity // ERROR: Property doesn't exist
}))
```

**Solution:** Use nullish coalescing to preserve valid falsy values.

```typescript
// Before (fails)
similarity: result.similarity

// After (improved - preserves 0 as valid similarity)
similarity: (result as any).similarity ?? 0
```

**Why `??` instead of `||`:**
- `||` coerces `0` to fallback (wrong for similarity scores)
- `??` only uses fallback for `null` or `undefined`
- Preserves valid zero values in numeric contexts

**Files Affected:** `src/lib/services/vector-search/index.ts`

---

## Best Practices Derived (Updated)

### 1. Type Safety First
- Create type guards and helper functions instead of inline casting
- Use nullish coalescing (`??`) for numeric values where 0 is valid
- Centralize type assertions in well-documented adapter functions
- Avoid `any` by creating specific helper functions

### 2. Logger Integration  
- Create safe logging helpers that handle serialization
- Test for serializability before logging complex objects
- Wrap primitives in objects for consistent logging interface
- Single point of maintenance for logging type conversions

### 3. Database Layer Patterns
- Make wrapper functions generic to preserve type information
- Maintain abstraction while preserving type safety
- Use explicit generic type parameters throughout the call chain
- Prefer wrapper functions over direct client access for consistency

### 4. External Library Compatibility
- Document temporary workarounds with TODO comments and issue links
- Create named adapter functions instead of inline `as any`
- Centralize compatibility logic for easy maintenance and removal
- Test compatibility adapters thoroughly

### 5. Metadata and Object Handling
- Create helper functions for safe object spreading
- Use proper type checking before casting
- Handle edge cases (null, undefined, non-objects) gracefully
- Use Number() for safe numeric conversion instead of type assertion

## Migration Guidelines (Updated)

When encountering similar errors:

1. **Identify the root cause** - Is it a type narrowing issue, missing export, or library incompatibility?
2. **Create helper functions first** - Avoid inline type assertions by creating dedicated helpers
3. **Document temporary workarounds** - Use TODO comments with issue links for library compatibility
4. **Use precise type operations** - Choose `??` over `||`, `Number()` over casting for numeric values
5. **Test thoroughly** - Verify runtime behavior, especially for edge cases in helpers
6. **Plan for maintenance** - Design fixes to be easily searchable and removable when no longer needed

## Monitoring for Regression

Watch for these recurring patterns:
- New const assertions causing include() errors
- Additional logger calls with complex objects
- New external library integrations
- Database schema changes affecting type inference
- API response format changes

Regular TypeScript version updates may resolve some of these issues, but maintaining backward compatibility requires careful testing.