import { useState, useMemo, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  useAgentAsk, 
  useGetAgentHistory, 
  useClearAgentHistory, 
  type ConversationTurn 
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { 
  Bot, Send, Plus, Trash2, Zap, Brain, Search, 
  Calculator, CheckCircle, Lightbulb, User, Sparkles
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const EXAMPLES = [
  { mode: "math", text: "If a train travels 120 km in 1.5 hours, what is its average speed in km/h?" },
  { mode: "math", text: "Janet has 24 apples. She gives 1/3 to Bob and 1/4 of the remainder to Carol. How many does she keep?" },
  { mode: "commonsense", text: "Where would you find a magazine that is not for reading? (A) dentist waiting room (B) gun (C) newsstand (D) mail box (E) library" },
  { mode: "logic", text: "All cats are mammals. Some mammals are pets. Does it follow that some cats are pets?" },
  { mode: "general", text: "What is the difference between deductive and inductive reasoning?" }
]

const getStepIcon = (type: string) => {
  switch (type) {
    case 'classify': return <Search className="w-4 h-4 text-blue-400" />
    case 'think': return <Brain className="w-4 h-4 text-purple-400" />
    case 'calculate': return <Calculator className="w-4 h-4 text-orange-400" />
    case 'verify': return <CheckCircle className="w-4 h-4 text-emerald-400" />
    case 'conclude': return <Lightbulb className="w-4 h-4 text-amber-400" />
    default: return <Brain className="w-4 h-4 text-muted-foreground" />
  }
}

const getConfidenceColor = (confidence: string) => {
  switch (confidence) {
    case 'high': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'low': return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  }
}

export default function LiveInference() {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [question, setQuestion] = useState("")
  const [mode, setMode] = useState<string>("auto")
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Queries & Mutations
  const { data: allHistory } = useGetAgentHistory({ limit: 100 }, { query: { refetchInterval: 10000 } })
  const askMutation = useAgentAsk()
  const clearMutation = useClearAgentHistory()

  // Process history into sessions
  const sessions = useMemo(() => {
    if (!allHistory) return []
    const map = new Map<string, ConversationTurn[]>()
    
    allHistory.forEach(turn => {
      if (!map.has(turn.sessionId)) map.set(turn.sessionId, [])
      map.get(turn.sessionId)!.push(turn)
    })
    
    return Array.from(map.entries()).map(([id, turns]) => {
      const sortedTurns = turns.sort((a, b) => a.turnNumber - b.turnNumber)
      return {
        id,
        turns: sortedTurns,
        firstQuestion: sortedTurns[0]?.question || "Empty Session",
        latestDate: new Date(sortedTurns[sortedTurns.length - 1].createdAt)
      }
    }).sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime())
  }, [allHistory])

  const activeSessionTurns = useMemo(() => {
    return sessions.find(s => s.id === sessionId)?.turns || []
  }, [sessions, sessionId])

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      const scrollEl = scrollRef.current
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    }
  }, [activeSessionTurns.length, askMutation.isPending])

  const handleNewSession = () => {
    setSessionId(crypto.randomUUID())
    setQuestion("")
  }

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    clearMutation.mutate(
      { sessionId: id },
      { onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/agent/history'] })
          if (sessionId === id) handleNewSession()
        }
      }
    )
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!question.trim() || askMutation.isPending) return

    const currentQuestion = question;
    setQuestion("") // Optimistic clear

    askMutation.mutate(
      { data: { question: currentQuestion, sessionId, mode: mode as any } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/agent/history'] }) }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex gap-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      
      {/* Left Panel: Conversation History */}
      <Card className="w-80 glass-panel flex flex-col hidden lg:flex border-border/50">
        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-black/20">
          <h3 className="font-semibold text-sm tracking-tight text-slate-200">Conversations</h3>
          <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-primary" onClick={handleNewSession}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => setSessionId(session.id)}
                className={`group cursor-pointer p-3 rounded-xl text-sm transition-all duration-200 flex items-start justify-between gap-2 ${
                  sessionId === session.id 
                    ? 'bg-primary/15 text-primary-foreground border border-primary/30 box-glow' 
                    : 'hover:bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="truncate font-medium leading-tight">
                    {session.firstQuestion}
                  </div>
                  <div className="text-[10px] opacity-60 mt-1.5 flex items-center gap-2">
                    {format(session.latestDate, 'MMM d, h:mm a')}
                    <span>•</span>
                    {session.turns.length} turns
                  </div>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className={`h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  disabled={clearMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                No past conversations.
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Right Panel: Active Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-card/40 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl overflow-hidden relative">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-border/50 flex items-center justify-between bg-black/20 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 box-glow">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-200">DE-COT Reasoning Agent</h2>
              <p className="text-[10px] text-primary flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Powered by GPT-4o-mini
              </p>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" ref={scrollRef}>
          {activeSessionTurns.length === 0 && !askMutation.isPending ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-8 animate-in slide-in-from-bottom-4 duration-700">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/20 box-glow">
                <Brain className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-glow">How can I help you reason today?</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  I am a specialized agent trained to break down complex problems step-by-step before answering.
                </p>
              </div>
              
              <div className="grid gap-2 w-full max-w-lg text-left">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setMode(ex.mode)
                      setQuestion(ex.text)
                    }}
                    className="p-3 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/80 hover:border-primary/50 transition-all text-sm text-muted-foreground hover:text-foreground flex items-center gap-3 text-left"
                  >
                    <Badge variant="outline" className="text-[10px] uppercase w-24 justify-center shrink-0 border-border bg-background">
                      {ex.mode}
                    </Badge>
                    <span className="truncate">{ex.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-4 max-w-4xl mx-auto w-full">
              <AnimatePresence initial={false}>
                {activeSessionTurns.map((turn) => (
                  <motion.div 
                    key={turn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* User Message */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] md:max-w-[70%] rounded-2xl rounded-tr-sm p-4 chat-bubble-user text-sm leading-relaxed">
                        {turn.question}
                      </div>
                    </div>

                    {/* Agent Message */}
                    <div className="flex justify-start">
                      <div className="max-w-[90%] w-full rounded-2xl rounded-tl-sm p-5 chat-bubble-agent">
                        
                        {/* Agent Metadata Header */}
                        <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-border/50">
                          <Badge variant="outline" className="uppercase text-[10px] bg-background/50 text-muted-foreground">
                            {turn.questionType}
                          </Badge>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className={`uppercase text-[10px] ${getConfidenceColor(turn.confidence)}`}>
                                {turn.confidence} Confidence
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Estimated based on reasoning certainty</TooltipContent>
                          </Tooltip>
                          <Badge variant="outline" className="text-[10px] font-mono flex items-center gap-1 border-primary/30 text-primary bg-primary/5 ml-auto">
                            <Zap className="h-3 w-3" /> {(turn.latencyMs / 1000).toFixed(2)}s
                          </Badge>
                        </div>

                        {/* Reasoning Accordion */}
                        <Accordion type="single" collapsible className="w-full mb-4">
                          <AccordionItem value="reasoning" className="border-border/50 bg-black/20 rounded-lg px-4 overflow-hidden data-[state=open]:pb-3">
                            <AccordionTrigger className="text-xs font-medium text-slate-300 hover:text-primary py-3 hover:no-underline">
                              <span className="flex items-center gap-2">
                                <Brain className="h-4 w-4" /> 
                                View Reasoning Trace ({turn.reasoning.length} steps)
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-0">
                              <div className="space-y-4 pl-1">
                                {turn.reasoning.map((step, idx) => (
                                  <div key={idx} className="relative pl-6 border-l-2 border-primary/20 last:border-transparent pb-1">
                                    <div className="absolute -left-[11px] top-0.5 bg-card rounded-full p-0.5 border border-primary/30">
                                      {getStepIcon(step.type)}
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-200 mb-1 leading-none">{step.title}</h4>
                                    <p className="text-sm text-slate-400 font-mono leading-relaxed bg-black/30 p-3 rounded-md border border-border/30">
                                      {step.content}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>

                        {/* Final Answer */}
                        <div className="prose prose-invert max-w-none text-sm leading-relaxed text-slate-200 font-medium">
                          {turn.answer}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Loading State */}
              {askMutation.isPending && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="chat-bubble-agent rounded-2xl rounded-tl-sm p-5 w-64">
                    <div className="flex items-center gap-3 text-primary h-6">
                      <span className="text-xs font-medium">Agent is thinking</span>
                      <div className="flex gap-1 ml-auto">
                        <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" />
                        <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s'}} />
                        <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s'}} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-card/80 border-t border-border/50 shrink-0 backdrop-blur-xl z-10">
          <form 
            onSubmit={handleSubmit}
            className="relative max-w-4xl mx-auto flex flex-col gap-3 bg-background rounded-xl border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all p-2 shadow-inner"
          >
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a reasoning question... (Shift+Enter for new line)"
              className="min-h-[60px] max-h-40 resize-none border-0 focus-visible:ring-0 bg-transparent text-sm p-3 font-mono"
              disabled={askMutation.isPending}
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="flex items-center gap-2">
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger className="h-8 w-[140px] text-xs border-none bg-secondary/50 text-muted-foreground hover:text-foreground">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="math">Mathematics</SelectItem>
                    <SelectItem value="commonsense">Common Sense</SelectItem>
                    <SelectItem value="logic">Logical Deduction</SelectItem>
                    <SelectItem value="general">General QA</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground hidden sm:inline-block">
                  Press <kbd className="font-sans px-1 py-0.5 rounded bg-secondary border border-border">Enter</kbd> to send
                </span>
              </div>
              <Button 
                type="submit" 
                size="sm"
                disabled={!question.trim() || askMutation.isPending}
                className="h-8 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
              >
                {askMutation.isPending ? "Reasoning..." : "Send"}
                {!askMutation.isPending && <Send className="h-3.5 w-3.5 ml-2" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
