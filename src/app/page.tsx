import Link from 'next/link'
import { MessageCircle, Upload, Target, Lightbulb } from 'lucide-react'

export default function Home() {
  return (
    <main className="container mx-auto p-4 max-w-4xl">
      <div className="text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold">JTBD Assistant Platform</h1>
          <p className="text-xl text-muted-foreground">
            Transform customer research into actionable insights
          </p>
        </div>

        {/* Main Action */}
        <div className="space-y-4">
          <Link 
            href="/chat" 
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-lg text-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            <MessageCircle className="w-6 h-6" />
            Start Chat Assistant
          </Link>
          <p className="text-sm text-muted-foreground">
            Begin exploring your customer insights and generating solutions
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="space-y-3 p-6 border rounded-lg">
            <Upload className="w-8 h-8 text-primary mx-auto" />
            <h3 className="font-semibold">Upload Research</h3>
            <p className="text-sm text-muted-foreground">
              Upload documents and automatically extract insights
            </p>
          </div>
          
          <div className="space-y-3 p-6 border rounded-lg">
            <Target className="w-8 h-8 text-primary mx-auto" />
            <h3 className="font-semibold">Define Metrics</h3>
            <p className="text-sm text-muted-foreground">
              Set measurable goals and track progress
            </p>
          </div>
          
          <div className="space-y-3 p-6 border rounded-lg">
            <Lightbulb className="w-8 h-8 text-primary mx-auto" />
            <h3 className="font-semibold">Generate Solutions</h3>
            <p className="text-sm text-muted-foreground">
              Create &quot;How Might We&quot; questions and prioritized solutions
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}