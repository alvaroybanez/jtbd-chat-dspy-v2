import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Chat endpoint ready for implementation',
    timestamp: new Date().toISOString()
  })
}