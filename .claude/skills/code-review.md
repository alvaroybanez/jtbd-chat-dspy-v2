# Code Review

Use this skill when you need to review code changes in a pull request, commit, or code snippet for quality, security, and best practices.

**Aliases:** "review this code", "check this PR", "code review", "review changes", "check code quality"

## Prerequisites

- Understanding of the project's coding standards (check CLAUDE.md)
- Access to the full context (not just the diff)
- Knowledge of the tech stack being used check .kiro/docs/completed/ for done tasks and .kiro/docs/reference/ for codebase references and tech stack

## Related Skills

## Skill Flow

### 1. Initial Assessment

First, understand what you're reviewing:

**Gather context:**
- What feature/fix is this addressing?
- What's the scope of changes?
- Are there related tickets/issues?
- What's the testing status?

**Determine review type:**

**Frontend Review** if:
- React/Vue/Angular components
- UI/UX changes
- Client-side logic
- CSS/styling changes
- Browser-specific code

→ Continue with **Frontend Path** (steps 2A-6A)

**Backend Review** if:
- API endpoints
- Database operations
- Server-side logic
- Authentication/authorization
- Background jobs

→ Continue with **Backend Path** (steps 2B-6B)

**Full-Stack Review** if:
- Changes span both frontend and backend
- API + UI changes together

→ Do both paths, starting with Backend

## Frontend Path: Client-Side Review

### 2A. Component Structure & React Patterns

**Check for:**

```tsx
// ❌ BAD: Direct DOM manipulation
useEffect(() => {
  document.getElementById('myDiv').style.color = 'red';
}, []);

// ✅ GOOD: React state-driven
const [color, setColor] = useState('red');
return <div style={{ color }}>Content</div>;
```

```tsx
// ❌ BAD: Inline function definitions
return (
  <button onClick={() => {
    fetchData();
    setLoading(true);
    // more logic
  }}>
    Click
  </button>
);

// ✅ GOOD: Extracted handler
const handleClick = useCallback(() => {
  fetchData();
  setLoading(true);
}, []);

return <button onClick={handleClick}>Click</button>;
```

### 3A. Performance & Optimization

**Check for:**

```tsx
// ❌ BAD: Missing dependencies
useEffect(() => {
  fetchUser(userId);
}, []); // Missing userId

// ✅ GOOD: Complete dependencies
useEffect(() => {
  fetchUser(userId);
}, [userId]);
```

```tsx
// ❌ BAD: Unnecessary re-renders
const MyComponent = ({ data }) => {
  const processedData = data.map(item => item.value * 2);
  // Recalculates every render
};

// ✅ GOOD: Memoized expensive operations
const MyComponent = ({ data }) => {
  const processedData = useMemo(
    () => data.map(item => item.value * 2),
    [data]
  );
};
```

### 4A. State Management & Data Flow

**Check for:**

```tsx
// ❌ BAD: Prop drilling
<Parent data={data}>
  <Child1 data={data}>
    <Child2 data={data}>
      <Child3 data={data} />
    </Child2>
  </Child1>
</Parent>

// ✅ GOOD: Context or state management
const DataContext = createContext();
<DataContext.Provider value={data}>
  <ComponentTree />
</DataContext.Provider>
```

### 5A. Accessibility & UX

**Check for:**

```tsx
// ❌ BAD: Missing accessibility
<div onClick={handleClick}>Click me</div>
<img src="photo.jpg" />

// ✅ GOOD: Proper accessibility
<button onClick={handleClick}>Click me</button>
<img src="photo.jpg" alt="Description of photo" />
```

```tsx
// ❌ BAD: No loading/error states
const MyComponent = () => {
  const { data } = useFetch('/api/data');
  return <div>{data.map(...)}</div>;
};

// ✅ GOOD: Complete UX states
const MyComponent = () => {
  const { data, loading, error } = useFetch('/api/data');
  
  if (loading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!data?.length) return <EmptyState />;
  
  return <div>{data.map(...)}</div>;
};
```

### 6A. Frontend Security

**Check for:**

```tsx
// ❌ BAD: XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ GOOD: Sanitized or avoided
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ 
  __html: DOMPurify.sanitize(userInput) 
}} />
```

```tsx
// ❌ BAD: Sensitive data in client
const API_KEY = "sk-secret-key-12345";

// ✅ GOOD: Environment variables for public keys only
const PUBLIC_KEY = process.env.NEXT_PUBLIC_API_KEY;
// Secret keys stay server-side only
```

## Backend Path: Server-Side Review

### 2B. API Design & REST/GraphQL Conventions

**Check for:**

```ts
// ❌ BAD: Inconsistent API design
app.get('/getUser/:id', ...)      // Verb in route
app.post('/users/update', ...)    // Wrong HTTP method
app.delete('/remove-user', ...)   // Inconsistent naming

// ✅ GOOD: RESTful conventions
app.get('/users/:id', ...)        // GET for retrieval
app.put('/users/:id', ...)        // PUT for update
app.delete('/users/:id', ...)     // DELETE for removal
```

### 3B. Data Validation & Sanitization

**Check for:**

```ts
// ❌ BAD: No validation
app.post('/users', async (req, res) => {
  const user = await db.create(req.body);
  res.json(user);
});

// ✅ GOOD: Validated input
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  age: z.number().min(0).max(120),
  name: z.string().min(1).max(100)
});

app.post('/users', async (req, res) => {
  try {
    const validated = UserSchema.parse(req.body);
    const user = await db.create(validated);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: 'Invalid input' });
  }
});
```

### 4B. Database Operations & Queries

**Check for:**

```ts
// ❌ BAD: SQL injection vulnerability
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ GOOD: Parameterized queries
const query = 'SELECT * FROM users WHERE id = $1';
const result = await db.query(query, [userId]);
```

```ts
// ❌ BAD: N+1 query problem
const posts = await db.query('SELECT * FROM posts');
for (const post of posts) {
  post.author = await db.query(
    'SELECT * FROM users WHERE id = $1', 
    [post.authorId]
  );
}

// ✅ GOOD: Optimized with JOIN
const posts = await db.query(`
  SELECT p.*, u.name as author_name 
  FROM posts p 
  JOIN users u ON p.author_id = u.id
`);
```

### 5B. Error Handling & Logging

**Check for:**

```ts
// ❌ BAD: Generic error handling
try {
  // operations
} catch (error) {
  res.status(500).json({ error: 'Something went wrong' });
}

// ✅ GOOD: Specific error handling
try {
  // operations
} catch (error) {
  logger.error('User creation failed', { 
    error, 
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  if (error instanceof ValidationError) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: error.details 
    });
  }
  
  if (error instanceof DatabaseError) {
    return res.status(503).json({ 
      error: 'Service temporarily unavailable' 
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    reference: generateErrorId()
  });
}
```

### 6B. Authentication & Authorization

**Check for:**

```ts
// ❌ BAD: No auth check
app.delete('/users/:id', async (req, res) => {
  await db.delete('users', req.params.id);
  res.json({ success: true });
});

// ✅ GOOD: Proper auth & authorization
app.delete('/users/:id', 
  requireAuth,
  async (req, res) => {
    const targetUserId = req.params.id;
    const requestingUser = req.user;
    
    // Check authorization
    if (requestingUser.id !== targetUserId && 
        !requestingUser.roles.includes('admin')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions' 
      });
    }
    
    await db.delete('users', targetUserId);
    res.json({ success: true });
  }
);
```

## Common Review Checklist

### Code Quality
- [ ] Follows project style guide
- [ ] No commented-out code
- [ ] Meaningful variable/function names
- [ ] DRY principle (no unnecessary duplication)
- [ ] Single responsibility principle
- [ ] Appropriate abstraction level

### Testing
- [ ] Has unit tests for new functionality
- [ ] Tests cover edge cases
- [ ] No broken existing tests
- [ ] Mocks/stubs used appropriately

### Documentation
- [ ] Complex logic has comments
- [ ] Public APIs documented
- [ ] README updated if needed
- [ ] Breaking changes noted

### Performance
- [ ] No obvious performance issues
- [ ] Database queries optimized
- [ ] Caching used where appropriate
- [ ] Bundle size impact considered (frontend)

### Security
- [ ] Input validation present
- [ ] No hardcoded secrets
- [ ] SQL injection prevented
- [ ] XSS vulnerabilities addressed
- [ ] CSRF protection in place
- [ ] Rate limiting on sensitive endpoints

## Providing Feedback

### Feedback Template

```markdown
## Overall Assessment
[Summary of the review - positive aspects first]

## Critical Issues (Must Fix)
- 🔴 [Security/Breaking issue]
  ```suggestion
  [Specific fix with code example]
  ```

## Important Improvements (Should Fix)
- 🟡 [Performance/Quality issue]
  ```suggestion
  [Improvement with explanation]
  ```

## Suggestions (Consider)
- 🟢 [Nice-to-have enhancement]
  
## Questions
- ❓ [Clarification needed on implementation choice]

## Positive Highlights
- ✅ [What was done well]
```

### Example Feedback

```markdown
## Overall Assessment
Good implementation of the user profile feature. The code is well-structured and follows most conventions. Found a few security concerns that need addressing before merge.

## Critical Issues (Must Fix)
- 🔴 SQL injection vulnerability in search function (line 45)
  ```suggestion
  // Replace
  const query = `SELECT * FROM users WHERE name LIKE '%${search}%'`;
  
  // With
  const query = 'SELECT * FROM users WHERE name LIKE $1';
  const result = await db.query(query, [`%${search}%`]);
  ```

## Important Improvements (Should Fix)
- 🟡 Missing rate limiting on `/api/users/search` endpoint
  ```suggestion
  import rateLimit from 'express-rate-limit';
  
  const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10 // 10 requests per minute
  });
  
  app.get('/api/users/search', searchLimiter, searchHandler);
  ```

## Suggestions (Consider)
- 🟢 Consider extracting the validation logic into a separate middleware for reusability

## Positive Highlights
- ✅ Excellent error handling with specific error types
- ✅ Good use of TypeScript types throughout
- ✅ Clean component structure with proper separation of concerns
```

## Common Pitfalls

- ❌ **Don't** only look at the diff - check surrounding context
- ❌ **Don't** approve with unresolved critical issues
- ❌ **Don't** be overly pedantic about style preferences
- ❌ **Don't** forget to test the actual functionality
- ✅ **Do** provide specific examples for improvements
- ✅ **Do** acknowledge good practices
- ✅ **Do** explain the "why" behind your feedback
- ✅ **Do** differentiate between blocking and non-blocking issues

## Verification

1. Pull the branch locally
2. Run the test suite
3. Test the functionality manually
4. Check for console errors (frontend)
5. Verify API responses (backend)
6. Review database migrations if present
7. Confirm documentation is updated

## Estimated Time

- Quick review (small PR): 5-10 minutes
- Standard review (medium PR): 15-30 minutes
- Thorough review (large PR): 30-60 minutes
- Architecture review: 60+ minutes