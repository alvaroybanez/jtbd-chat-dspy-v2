/**
 * Chat Services Test Suite Runner
 * Entry point for all chat service tests with organized test execution and reporting
 */

describe('JTBD Assistant Chat Services Test Suite', () => {
  describe('🎯 Intent Detection Service', () => {
    require('./intent-detector.test')
  })

  describe('🔍 Context Retrieval Service', () => {
    require('./context-retrieval.test')
  })

  describe('💰 Token Budget Management', () => {
    require('./token-budget.test')
  })

  describe('🔗 End-to-End Integration', () => {
    require('./chat-integration.test')
  })

  // Test suite health check
  test('should have all test dependencies available', () => {
    expect(require('./test-utils')).toBeDefined()
    expect(require('../intent-detector')).toBeDefined()
    expect(require('../context-retrieval')).toBeDefined()
    expect(require('../token-budget')).toBeDefined()
  })

  // Performance baseline test
  test('should maintain overall system performance', async () => {
    const startTime = Date.now()
    
    // Simulate basic operations that should be fast
    const { detectChatIntent } = require('../intent-detector')
    const result = detectChatIntent('test message')
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    expect(duration).toBeLessThan(50) // Should be very fast
    expect(result).toBeDefined()
  })
})