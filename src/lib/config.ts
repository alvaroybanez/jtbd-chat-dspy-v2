export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small'
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!
  },
  dspy: {
    serviceUrl: process.env.DSPY_SERVICE_URL || 'http://localhost:8000',
    apiKey: process.env.DSPY_API_KEY!,
    timeout: 30000 // 30 seconds
  }
} as const

export function validateConfig() {
  const required = [
    'OPENAI_API_KEY',
    'SUPABASE_URL', 
    'SUPABASE_ANON_KEY',
    'DSPY_API_KEY'
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}