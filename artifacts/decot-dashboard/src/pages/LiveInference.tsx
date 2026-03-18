import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  useGetAgentHistory,
  useClearAgentHistory,
  type ConversationTurn
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  Bot, Send, Plus, Trash2, Zap, Brain, Search,
  Calculator, CheckCircle, Lightbulb
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "")

const EXAMPLES = [
  { mode: "math", text: "If a train travels 120 km in 1.5 hours, what is its average speed in km/h?" },
  { mode: "math", text: "Janet has 24 apples. She gives 1/3 to Bob and 1/4 of the remainder to Carol. How many does she keep?" },
  { mode: "commonsense", text: "Where would you find a magazine that is not for reading? (A) dentist waiting room (B) gun (C) newsstand (D) mail box (E) library" },
  { mode: "logic", text: "All cats are mammals. Some mammals are pets. Does it follow that some cats are pets?" },
  { mode: "general", text: "What is the difference between deductive and inductive reasoning?" },
]

const getStepIcon = (type: string) => {
  switch (type) {
    case "classify": return <Search className="w-3.5 h-3.5 text-blue-400" />
    case "think":    return <Brain className="w-3.5 h-3.5 text-purple-400" />
    case "calculate":return <Calculator className="w-3.5 h-3.5 text-orange-400" />
    case "verify":   return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    case "conclude": return <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
    default:         return <Brain className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

const confidenceClass = (c: string) => ({
  high:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low:    "bg-rose-500/10 text-rose-400 border-rose-500/20",
}[c] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20")

// ─── Types ────────────────────────────────────────────────────────────────────

interface StreamingTurn {
  id: string               // temp id during streaming
  sessionId: string
  question: string
  streaming: true
  streamedText: string
}

interface CompletedTurn extends Omit<ConversationTurn, "reasoning"> {
  streaming: false
  reasoning: Array<{ stepNumber: number; title: string; content: string; type: string }>
}

type ChatTurn = StreamingTurn | CompletedTurn

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveInference() {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [question, setQuestion] = useState("")
  const [mode, setMode] = useState("auto")
  const [pendingTurns, setPendingTurns] = useState<ChatTurn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [latency, setLatency] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: allHistory, refetch: refetchHistory } = useGetAgentHistory(
    { limit: 100 },
    { query: { refetchInterval: 15000 } }
  )
  const clearMutation = useClearAgentHistory()

  // Group history into sessions
  const sessions = useMemo(() => {
    if (!allHistory) return []
    const map = new Map<string, ConversationTurn[]>()
    allHistory.forEach(t => {
      if (!map.has(t.sessionId)) map.set(t.sessionId, [])
      map.get(t.sessionId)!.push(t)
    })
    return Array.from(map.entries()).map(([id, turns]) => {
      const sorted = [...turns].sort((a, b) => a.turnNumber - b.turnNumber)
      return { id, turns: sorted, firstQuestion: sorted[0]?.question ?? "Session", latestDate: new Date(sorted.at(-1)!.createdAt) }
    }).sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime())
  }, [allHistory])

  // Canonical turns from DB for active session
  const dbTurns: CompletedTurn[] = useMemo(() => {
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return []
    return session.turns.map(t => ({
      ...t,
      streaming: false as const,
      reasoning: (t.reasoning ?? []) as CompletedTurn["reasoning"],
    }))
  }, [sessions, sessionId])

  // Merge: DB turns + any pending streaming turns not yet in DB
  const displayTurns: ChatTurn[] = useMemo(() => {
    const dbIds = new Set(dbTurns.map(t => t.id))
    const extra = pendingTurns.filter(p => p.sessionId === sessionId && (p.streaming || !dbIds.has((p as CompletedTurn).id)))
    return [...dbTurns, ...extra]
  }, [dbTurns, pendingTurns, sessionId])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [displayTurns.length, isStreaming])

  // SSE streaming ask
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = question.trim()
    if (!q || isStreaming) return

    setQuestion("")
    setIsStreaming(true)
    setLatency(null)
    const t0 = performance.now()

    const tempId = `stream-${crypto.randomUUID()}`
    const streamTurn: StreamingTurn = { id: tempId, sessionId, question: q, streaming: true, streamedText: "" }
    setPendingTurns(prev => [...prev, streamTurn])

    try {
      const resp = await fetch(`${BASE}/api/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sessionId, mode }),
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          let msg: Record<string, unknown>
          try { msg = JSON.parse(raw) } catch { continue }

          if (msg.token) {
            setPendingTurns(prev =>
              prev.map(t => t.id === tempId && t.streaming
                ? { ...t, streamedText: t.streamedText + (msg.token as string) }
                : t
              )
            )
          }

          if (msg.done) {
            const ms = Math.round(performance.now() - t0)
            setLatency(ms)
            // Remove the streaming turn (DB fetch will show the real one)
            setPendingTurns(prev => prev.filter(t => t.id !== tempId))
            await refetchHistory()
          }

          if (msg.error) {
            setPendingTurns(prev => prev.filter(t => t.id !== tempId))
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err)
      setPendingTurns(prev => prev.filter(t => t.id !== tempId))
    } finally {
      setIsStreaming(false)
    }
  }, [question, isStreaming, sessionId, mode, refetchHistory])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleNewSession = () => {
    setPendingTurns([])
    setSessionId(crypto.randomUUID())
    setQuestion("")
    setLatency(null)
  }

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    clearMutation.mutate(
      { sessionId: id },
      { onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/agent/history"] })
          if (sessionId === id) handleNewSession()
        }
      }
    )
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex gap-4 animate-in fade-in duration-500 max-w-[1600px] mx-auto">

      {/* Left: Sessions */}
      <Card className="w-72 hidden lg:flex flex-col border-border/50 bg-card/40 backdrop-blur-md overflow-hidden">
        <div className="p-3 border-b border-border/50 flex items-center justify-between bg-black/20 shrink-0">
          <h3 className="text-sm font-semibold text-slate-200">Conversations</h3>
          <div className="flex items-center gap-1">
            {sessions.length > 0 && (
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Delete all conversations"
                disabled={clearMutation.isPending}
                onClick={() => {
                  fetch(`${BASE}/api/agent/history`, { method: "DELETE" }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/history"] })
                    handleNewSession()
                  })
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-primary" onClick={handleNewSession}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setSessionId(s.id)}
                className={`group cursor-pointer p-2.5 rounded-lg text-sm transition-all flex items-start justify-between gap-2 ${
                  sessionId === s.id
                    ? "bg-primary/15 border border-primary/30"
                    : "hover:bg-secondary border border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="overflow-hidden min-w-0">
                  <div className="truncate text-xs font-medium leading-tight">{s.firstQuestion}</div>
                  <div className="text-[10px] opacity-50 mt-1">
                    {format(s.latestDate, "MMM d, h:mm a")} · {s.turns.length}t
                  </div>
                </div>
                <Button
                  size="icon" variant="ghost"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={e => handleDeleteSession(e, s.id)}
                  disabled={clearMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="p-4 text-center text-[11px] text-muted-foreground italic">No conversations yet.</p>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Right: Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-card/40 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="h-14 px-5 border-b border-border/50 flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-slate-200">DE-COT Reasoning Agent</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {latency !== null && (
              <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/5 flex items-center gap-1">
                <Zap className="h-3 w-3" /> {(latency / 1000).toFixed(2)}s
              </Badge>
            )}
            {displayTurns.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center gap-1.5"
                disabled={clearMutation.isPending || isStreaming}
                onClick={() => clearMutation.mutate(
                  { sessionId },
                  { onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: ["/api/agent/history"] })
                      handleNewSession()
                    }
                  }
                )}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear chat
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5" ref={scrollRef}>
          {displayTurns.length === 0 && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center space-y-6">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/20">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">How can I help you reason today?</h2>
                <p className="text-muted-foreground text-sm mt-1">Step-by-step reasoning on math, logic & more.</p>
              </div>
              <div className="grid gap-1.5 w-full text-left">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { setMode(ex.mode); setQuestion(ex.text) }}
                    className="p-2.5 rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary/70 hover:border-primary/40 transition-all text-xs text-muted-foreground hover:text-foreground flex items-center gap-2.5 text-left"
                  >
                    <Badge variant="outline" className="text-[9px] uppercase w-20 justify-center shrink-0 border-border/60 bg-background/60">
                      {ex.mode}
                    </Badge>
                    <span className="truncate">{ex.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pb-2 max-w-3xl mx-auto w-full">
              <AnimatePresence initial={false}>
                {displayTurns.map(turn => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    {/* User bubble */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 chat-bubble-user text-sm leading-relaxed">
                        {turn.question}
                      </div>
                    </div>

                    {/* Agent bubble */}
                    <div className="flex justify-start">
                      {turn.streaming ? (
                        /* ── Streaming: show raw text as it arrives ── */
                        <div className="max-w-[92%] rounded-2xl rounded-tl-sm px-5 py-4 chat-bubble-agent">
                          <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-border/40">
                            <Brain className="h-3.5 w-3.5 text-primary animate-pulse" />
                            <span className="text-[11px] text-primary font-medium">Reasoning…</span>
                          </div>
                          <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                            {turn.streamedText}
                            <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse rounded-sm" />
                          </pre>
                        </div>
                      ) : (
                        /* ── Completed: structured view ── */
                        <div className="max-w-[92%] w-full rounded-2xl rounded-tl-sm px-5 py-4 chat-bubble-agent">
                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-2.5 border-b border-border/40">
                            <Badge variant="outline" className="uppercase text-[9px] bg-background/50 text-muted-foreground">
                              {turn.questionType}
                            </Badge>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className={`uppercase text-[9px] ${confidenceClass(turn.confidence)}`}>
                                  {turn.confidence}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Confidence based on reasoning certainty</TooltipContent>
                            </Tooltip>
                            <Badge variant="outline" className="text-[9px] font-mono flex items-center gap-0.5 border-primary/30 text-primary bg-primary/5 ml-auto">
                              <Zap className="h-2.5 w-2.5" /> {((turn as CompletedTurn).latencyMs / 1000).toFixed(2)}s
                            </Badge>
                          </div>

                          {/* Reasoning accordion */}
                          <Accordion type="single" collapsible className="mb-3">
                            <AccordionItem value="r" className="border-border/40 bg-black/20 rounded-lg px-3 data-[state=open]:pb-3">
                              <AccordionTrigger className="text-[11px] font-medium text-slate-300 hover:text-primary py-2.5 hover:no-underline">
                                <span className="flex items-center gap-1.5">
                                  <Brain className="h-3.5 w-3.5" />
                                  Reasoning trace ({(turn as CompletedTurn).reasoning?.length ?? 0} steps)
                                </span>
                              </AccordionTrigger>
                              <AccordionContent className="pt-1 pb-0">
                                <div className="space-y-3 pl-1">
                                  {((turn as CompletedTurn).reasoning ?? []).map((step, idx) => (
                                    <div key={idx} className="relative pl-5 border-l-2 border-primary/20 last:border-transparent">
                                      <div className="absolute -left-[9px] top-0.5 bg-card rounded-full p-0.5 border border-primary/30">
                                        {getStepIcon(step.type)}
                                      </div>
                                      <h4 className="text-[11px] font-bold text-slate-200 mb-1">{step.title}</h4>
                                      <p className="text-xs text-slate-400 font-mono bg-black/30 p-2.5 rounded border border-border/30 leading-relaxed">
                                        {step.content || "—"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>

                          {/* Answer */}
                          <p className="text-sm text-slate-200 font-medium leading-relaxed">{turn.answer}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 bg-card/80 border-t border-border/50 shrink-0 backdrop-blur-xl">
          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto flex flex-col gap-2 bg-background rounded-xl border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all p-2 shadow-inner"
          >
            <Textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a reasoning question… (Enter to send, Shift+Enter for newline)"
              className="min-h-[52px] max-h-32 resize-none border-0 focus-visible:ring-0 bg-transparent text-sm p-2 font-mono"
              disabled={isStreaming}
            />
            <div className="flex items-center justify-between px-1">
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-7 w-[130px] text-[11px] border-none bg-secondary/50 text-muted-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="math">Mathematics</SelectItem>
                  <SelectItem value="commonsense">Common Sense</SelectItem>
                  <SelectItem value="logic">Logic</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="submit"
                size="sm"
                disabled={!question.trim() || isStreaming}
                className="h-7 px-3 text-xs rounded-lg bg-primary hover:bg-primary/90 shadow-[0_0_8px_rgba(6,182,212,0.3)] disabled:opacity-40"
              >
                {isStreaming ? "Reasoning…" : <><Send className="h-3 w-3 mr-1.5" />Send</>}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
