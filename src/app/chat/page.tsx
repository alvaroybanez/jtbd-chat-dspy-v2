'use client'

import ChatContainer from '@/components/chat/ChatContainer'

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl h-screen">
        <ChatContainer />
      </div>
    </div>
  )
}