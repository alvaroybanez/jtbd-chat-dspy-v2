/**
 * Simple test demo for Intent Detection Service
 * Run with: npx tsx src/lib/services/chat/test-intent-detector.ts
 */

import { detectChatIntent, ChatIntent, requiresContext, isRetrievalIntent } from './intent-detector'

// Test cases covering all intent mappings
const testCases = [
  // Insights
  { message: "What insights do we have?", expectedIntent: ChatIntent.RETRIEVE_INSIGHTS },
  { message: "what did we learn from users", expectedIntent: ChatIntent.RETRIEVE_INSIGHTS },
  { message: "Show me our learnings", expectedIntent: ChatIntent.RETRIEVE_INSIGHTS },
  
  // Metrics
  { message: "What metrics should we measure?", expectedIntent: ChatIntent.RETRIEVE_METRICS },
  { message: "Show me our KPIs", expectedIntent: ChatIntent.RETRIEVE_METRICS },
  { message: "How do we measure success?", expectedIntent: ChatIntent.RETRIEVE_METRICS },
  
  // JTBDs
  { message: "What are our jobs to be done?", expectedIntent: ChatIntent.RETRIEVE_JTBDS },
  { message: "Show me the jtbd statements", expectedIntent: ChatIntent.RETRIEVE_JTBDS },
  { message: "What job to be done should we focus on?", expectedIntent: ChatIntent.RETRIEVE_JTBDS },
  
  // HMW
  { message: "Generate how might we questions", expectedIntent: ChatIntent.GENERATE_HMW },
  { message: "Create HMW questions for this problem", expectedIntent: ChatIntent.GENERATE_HMW },
  { message: "how might we improve user experience", expectedIntent: ChatIntent.GENERATE_HMW },
  
  // Solutions
  { message: "Create solutions for this problem", expectedIntent: ChatIntent.CREATE_SOLUTIONS },
  { message: "How do we solve this issue?", expectedIntent: ChatIntent.CREATE_SOLUTIONS },
  { message: "What ideas do you have?", expectedIntent: ChatIntent.CREATE_SOLUTIONS },
  
  // General exploration
  { message: "Tell me about this product", expectedIntent: ChatIntent.GENERAL_EXPLORATION },
  { message: "What's happening here?", expectedIntent: ChatIntent.GENERAL_EXPLORATION },
  { message: "Random question", expectedIntent: ChatIntent.GENERAL_EXPLORATION },
]

function runTests() {
  console.log('🤖 Testing Chat Intent Detection Service\n')
  
  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    const result = detectChatIntent(testCase.message)
    const success = result.intent === testCase.expectedIntent
    
    if (success) {
      passed++
      console.log(`✅ "${testCase.message}" → ${result.intent} (confidence: ${result.confidence.toFixed(2)})`)
    } else {
      failed++
      console.log(`❌ "${testCase.message}" → Expected: ${testCase.expectedIntent}, Got: ${result.intent}`)
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
  
  // Test utility functions
  console.log('\n🔧 Testing Utility Functions:')
  console.log(`requiresContext(GENERATE_HMW): ${requiresContext(ChatIntent.GENERATE_HMW)}`)
  console.log(`requiresContext(RETRIEVE_INSIGHTS): ${requiresContext(ChatIntent.RETRIEVE_INSIGHTS)}`)
  console.log(`isRetrievalIntent(RETRIEVE_METRICS): ${isRetrievalIntent(ChatIntent.RETRIEVE_METRICS)}`)
  console.log(`isRetrievalIntent(CREATE_SOLUTIONS): ${isRetrievalIntent(ChatIntent.CREATE_SOLUTIONS)}`)
  
  // Test edge cases
  console.log('\n🧪 Testing Edge Cases:')
  console.log('Empty message:', detectChatIntent('').intent)
  console.log('Null message:', detectChatIntent(null as any).intent)
  console.log('Very long message:', detectChatIntent('This is a very long message that should still detect insights correctly when we mention insights at the end').intent)
}

if (require.main === module) {
  runTests()
}

export { runTests }