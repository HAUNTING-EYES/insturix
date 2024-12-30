"use client"

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Zap } from 'lucide-react'

export default function InteractiveDemo() {
  const [input, setInput] = useState("Describe an innovative AI application")
  const [output, setOutput] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate AI processing
    setOutput("Here's a simulated AI-generated response based on your input. In a real application, this would be where the AI processes the input and returns a result.")
  }

  return (
    <section className="py-16 md:py-24 bg-black text-white dark:bg-white dark:text-black">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">Interactive AI Demo</h2>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="bg-black text-white p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Input</h3>
            <form onSubmit={handleSubmit}>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full mb-4 bg-white/10 border-white/20 text-white"
                rows={4}
              />
              <Button type="submit" className="w-full group">
                Process with AI
                <Zap className="ml-2 h-4 w-4 transition-transform group-hover:scale-110" />
              </Button>
            </form>
          </div>
          <div className="bg-gray-100 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Output</h3>
            <div className="bg-white border border-gray-200 rounded p-4 h-[200px] overflow-auto">
              {output || "AI-generated output will appear here..."}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

