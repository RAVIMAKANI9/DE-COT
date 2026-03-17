import { useState } from "react"
import { useInferenceQuery, useGetInferenceStatus } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { Bot, Send, Zap, AlertTriangle, ShieldCheck } from "lucide-react"

const EXAMPLES = {
  gsm8k: "A juggler can juggle 16 balls. Half of the balls are golf balls, and half of the golf balls are blue. How many blue golf balls are there?",
  commonsenseqa: "Where would you find a magazine that is not for reading? (A) dentist waiting room (B) gun (C) newsstand (D) mail box (E) library",
  aqua: "If x = 3 and y = 4, what is the value of x^2 + y^2?"
}

export default function LiveInference() {
  const [question, setQuestion] = useState("")
  const [benchmark, setBenchmark] = useState<string>("gsm8k")
  
  const { data: status, isLoading: statusLoading } = useGetInferenceStatus({ query: { refetchInterval: 10000 } })
  const inferenceMutation = useInferenceQuery()

  if (statusLoading) return <LoadingScreen />

  const handleBenchmarkChange = (val: string) => {
    setBenchmark(val)
    setQuestion(EXAMPLES[val as keyof typeof EXAMPLES])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return
    inferenceMutation.mutate({ data: { question, benchmark } })
  }

  const isReady = status?.readyForInference;

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-glow flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" /> Model Playground
          </h1>
          <p className="text-muted-foreground mt-1">Test the fine-tuned DE-COT model directly.</p>
        </div>
        <div>
          {isReady ? (
            <Badge variant="success" className="px-3 py-1 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Ready for Inference
            </Badge>
          ) : (
            <Badge variant="warning" className="px-3 py-1 flex items-center gap-2 animate-pulse">
              <AlertTriangle className="h-4 w-4" /> Model Not Loaded
            </Badge>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 flex-1">
        {/* Input Panel */}
        <Card className="glass-panel flex flex-col">
          <CardHeader>
            <CardTitle>Query Formulation</CardTitle>
            <CardDescription>Select a prompt format and enter your question</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Prompt Format Hint</label>
                <Select value={benchmark} onValueChange={handleBenchmarkChange}>
                  <SelectTrigger className="bg-background/50 border-border">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gsm8k">GSM8K (Math)</SelectItem>
                    <SelectItem value="commonsenseqa">CommonsenseQA</SelectItem>
                    <SelectItem value="aqua">AQuA-RAT</SelectItem>
                    <SelectItem value="none">Raw (No formatting)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1 flex flex-col space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Input Text</label>
                <Textarea 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Enter reasoning question here..."
                  className="flex-1 resize-none bg-background/50 border-border font-mono text-sm p-4"
                  disabled={!isReady || inferenceMutation.isPending}
                />
              </div>

              <Button 
                type="submit" 
                disabled={!isReady || !question.trim() || inferenceMutation.isPending}
                className="w-full h-12 text-md gap-2"
              >
                {inferenceMutation.isPending ? "Generating..." : "Generate Reasoning Trace"}
                {!inferenceMutation.isPending && <Send className="h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Output Panel */}
        <Card className="glass-panel flex flex-col bg-[#0A0A0A] border-border relative overflow-hidden">
          <CardHeader className="bg-[#111] border-b border-border shrink-0">
            <div className="flex justify-between items-center">
              <CardTitle className="text-slate-300">Model Output</CardTitle>
              {inferenceMutation.isSuccess && (
                <div className="flex gap-2">
                  {inferenceMutation.data.usedFallback && (
                    <Badge variant="warning" className="text-[10px]">Base Model Used</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] font-mono flex items-center gap-1 border-primary/30 text-primary bg-primary/5">
                    <Zap className="h-3 w-3" /> {inferenceMutation.data.latencyMs}ms
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 relative">
            <div className="absolute inset-0 p-6 overflow-y-auto font-mono text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
              {inferenceMutation.isPending ? (
                 <div className="flex items-center gap-3 text-primary animate-pulse">
                   <div className="h-2 w-2 bg-primary rounded-full animate-bounce" />
                   <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s'}} />
                   <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s'}} />
                 </div>
              ) : inferenceMutation.isError ? (
                <div className="text-destructive p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                  Error: {inferenceMutation.error?.error || "Failed to generate inference"}
                </div>
              ) : inferenceMutation.data ? (
                <div className="animate-in fade-in duration-500">
                  {inferenceMutation.data.answer}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 italic">
                  Output will appear here...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
