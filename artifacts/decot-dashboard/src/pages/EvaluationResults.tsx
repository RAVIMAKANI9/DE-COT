import { useGetEvaluationMetrics } from "@workspace/api-client-react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingScreen } from "@/components/ui/loading-screen"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, Legend, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, RadialBarChart, RadialBar
} from "recharts"
import { formatPercent } from "@/lib/utils"
import { format } from "date-fns"
import { Zap, Clock, Activity, TrendingUp, FlaskConical, Languages, BarChart2 } from "lucide-react"

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "")

// ─── Types ────────────────────────────────────────────────────────────────────

interface QualityMetric {
  metric: string; key: string; target: number;
  actual: number | null; category: string; status: string
}

interface PerfStats {
  totalRequests: number; avgLatencyMs: number | null;
  p50LatencyMs: number | null; p95LatencyMs: number | null;
  minLatencyMs: number | null; maxLatencyMs: number | null;
  recentRequests: number;
  targets: { latencyMs: { min: number; max: number }; throughputRps: { min: number; max: number } }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const pct = (v: number | null) => v == null ? "—" : `${(v * 100).toFixed(1)}%`
const ms  = (v: number | null) => v == null ? "—" : `${v}ms`
const sec = (v: number | null) => v == null ? "—" : `${(v / 1000).toFixed(2)}s`

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null)
    return <Badge variant="outline" className="text-[9px] uppercase border-border/50 text-muted-foreground">Pending</Badge>
  return ok
    ? <Badge variant="outline" className="text-[9px] uppercase border-emerald-500/30 bg-emerald-500/10 text-emerald-400">On Target</Badge>
    : <Badge variant="outline" className="text-[9px] uppercase border-amber-500/30 bg-amber-500/10 text-amber-400">Below Target</Badge>
}

// Filled arc progress component (pure CSS)
function ArcProgress({ value, target, label, sublabel }: {
  value: number | null; target: number; label: string; sublabel?: string
}) {
  const pctVal  = value != null ? value * 100 : 0
  const pctTgt  = target * 100
  const met     = value != null && value >= target
  const color   = value == null ? "#334155" : met ? "#10b981" : "#06b6d4"
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="2.5"
            strokeDasharray={`${pctVal} ${100 - pctVal}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>
            {value == null ? "—" : `${pctVal.toFixed(0)}%`}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-semibold text-slate-300">{label}</div>
        {sublabel && <div className="text-[10px] text-muted-foreground">target {(pctTgt).toFixed(0)}%</div>}
      </div>
    </div>
  )
}

// Latency gauge bar
function LatencyBar({ value, min, max, label }: { value: number | null; min: number; max: number; label: string }) {
  const inRange = value != null && value >= min && value <= max
  const pct = value != null ? Math.min((value / 1500) * 100, 100) : 0
  const color = value == null ? "bg-muted/30" : inRange ? "bg-emerald-500" : value < min ? "bg-primary" : "bg-rose-500"
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className="font-mono text-primary">{sec(value)}</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 bg-emerald-500/20 rounded-full"
          style={{ left: `${(min / 1500) * 100}%`, right: `${100 - (max / 1500) * 100}%` }} />
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span className="text-emerald-500/70">target {min}–{max}ms</span>
        <span>1500ms</span>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EvaluationResults() {
  const { data: metrics, isLoading: metricsLoading } = useGetEvaluationMetrics({ query: { refetchInterval: 30000 } })

  const { data: quality, isLoading: qualityLoading } = useQuery<QualityMetric[]>({
    queryKey: ["/api/evaluation/quality"],
    queryFn: () => fetch(`${BASE}/api/evaluation/quality`).then(r => r.json()),
    refetchInterval: 30000,
  })

  const { data: perf, isLoading: perfLoading } = useQuery<PerfStats>({
    queryKey: ["/api/evaluation/performance"],
    queryFn: () => fetch(`${BASE}/api/evaluation/performance`).then(r => r.json()),
    refetchInterval: 10000,
  })

  if (metricsLoading || qualityLoading || perfLoading) return <LoadingScreen />

  const hasAccuracy = metrics && metrics.some(m => m.accuracy > 0)
  const accuracyMetrics  = quality?.filter(q => q.category === "accuracy") ?? []
  const languageMetrics  = quality?.filter(q => q.category === "language") ?? []

  // Radar chart data for language metrics
  const radarData = languageMetrics.map(q => ({
    metric: q.metric,
    Target: Math.round(q.target * 100),
    Actual: q.actual != null ? Math.round(q.actual * 100) : 0,
  }))

  const latencyOk = perf?.avgLatencyMs != null
    && perf.avgLatencyMs >= perf.targets.latencyMs.min
    && perf.avgLatencyMs <= perf.targets.latencyMs.max

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-glow">Evaluation Metrics</h1>
        <p className="text-muted-foreground mt-1">Full metric suite per DE-COT v1.0 specification.</p>
      </div>

      <Tabs defaultValue="accuracy" className="w-full">
        <TabsList className="bg-secondary/40 border border-border/40">
          <TabsTrigger value="accuracy" className="flex items-center gap-1.5 text-xs">
            <BarChart2 className="h-3.5 w-3.5" /> Benchmark Accuracy
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5" /> Accuracy Metrics
          </TabsTrigger>
          <TabsTrigger value="language" className="flex items-center gap-1.5 text-xs">
            <Languages className="h-3.5 w-3.5" /> Language Quality
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5" /> System Performance
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Benchmark Accuracy ── */}
        <TabsContent value="accuracy" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="glass-panel lg:col-span-2 flex flex-col">
              <CardHeader>
                <CardTitle>Benchmark Accuracy vs Target</CardTitle>
                <CardDescription>Fine-tuned Llama-2-7B vs DE-COT paper baselines</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[360px]">
                {!hasAccuracy ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-lg">
                    AWAITING_EVALUATION_PHASE
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="benchmark" stroke="hsl(var(--muted-foreground))" fontSize={12}
                        tickLine={false} axisLine={false} tickFormatter={v => v.toUpperCase()} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12}
                        tickLine={false} axisLine={false} tickFormatter={v => `${v * 100}%`} domain={[0, 1]} />
                      <RechartTooltip cursor={{ fill: "hsl(var(--muted)/0.2)" }}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                        formatter={(v: number) => formatPercent(v)} />
                      <Legend wrapperStyle={{ paddingTop: 20 }} />
                      <Bar dataKey="accuracy" name="Achieved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={60}>
                        {metrics!.map((e, i) => (
                          <Cell key={i} fill={e.accuracy >= e.targetAccuracy ? "hsl(var(--success))" : "hsl(var(--primary))"} />
                        ))}
                      </Bar>
                      <Bar dataKey="targetAccuracy" name="Target" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={60} opacity={0.5} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {metrics?.map(m => (
                <Card key={m.benchmark} className="glass-panel">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex justify-between">
                      {m.benchmark}
                      <StatusBadge ok={m.accuracy > 0 ? m.accuracy >= m.targetAccuracy : null} label="" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <div className="text-3xl font-bold">{m.accuracy > 0 ? formatPercent(m.accuracy) : "—"}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Target {formatPercent(m.targetAccuracy)}</div>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        <div>{m.sampleCount > 0 ? `${m.sampleCount} samples` : "Pending"}</div>
                        {m.evaluatedAt && <div>{format(new Date(m.evaluatedAt), "MMM d, HH:mm")}</div>}
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden relative">
                      <div className="absolute inset-y-0 bg-accent/30 rounded-full" style={{ width: `${m.targetAccuracy * 100}%` }} />
                      <div className={`absolute inset-y-0 rounded-full z-10 ${m.accuracy >= m.targetAccuracy ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${m.accuracy * 100}%` }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 2: Accuracy Quality Metrics (EM, F1, nDCG) ── */}
        <TabsContent value="quality" className="mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary" /> Accuracy Metrics
                </CardTitle>
                <CardDescription>Exact Match, F1 and ranking quality vs spec targets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-around py-6">
                  {accuracyMetrics.map(q => (
                    <ArcProgress key={q.key} value={q.actual} target={q.target} label={q.metric} sublabel="target" />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Spec Targets Summary</CardTitle>
                <CardDescription>DE-COT v1.0 specification performance requirements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {accuracyMetrics.map(q => (
                  <div key={q.key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{q.metric}</div>
                      <div className="text-[11px] text-muted-foreground">Target: {pct(q.target)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-primary font-mono">
                        {q.actual != null ? pct(q.actual) : "—"}
                      </span>
                      <StatusBadge ok={q.actual != null ? q.actual >= q.target : null} label="" />
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground italic pt-2">
                  Populated automatically after Phase 5 (Evaluate) completes.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 3: Language Quality (BLEU, ROUGE-L, METEOR, BERTScore) ── */}
        <TabsContent value="language" className="mt-6">
          <div className="grid lg:grid-cols-5 gap-6">
            <Card className="glass-panel lg:col-span-3 flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-primary" /> Language Quality Radar
                </CardTitle>
                <CardDescription>Target vs actual across BLEU, ROUGE-L, METEOR, BERTScore</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Radar name="Target" dataKey="Target" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.15} strokeWidth={1.5} />
                    <Radar name="Actual" dataKey="Actual" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-3">
              {languageMetrics.map(q => (
                <Card key={q.key} className="glass-panel">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-200">{q.metric}</span>
                      <StatusBadge ok={q.actual != null ? q.actual >= q.target : null} label="" />
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-2xl font-bold font-mono text-primary">
                        {q.actual != null ? pct(q.actual) : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">target {pct(q.target)}</div>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full bg-secondary rounded-full overflow-hidden relative">
                      <div className="absolute inset-y-0 bg-accent/30 rounded-full" style={{ width: `${q.target * 100}%` }} />
                      <div className="absolute inset-y-0 bg-primary rounded-full transition-all duration-700"
                        style={{ width: `${(q.actual ?? 0) * 100}%` }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 4: System Performance ── */}
        <TabsContent value="performance" className="mt-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

            {/* Latency stats */}
            <Card className="glass-panel xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Inference Latency
                </CardTitle>
                <CardDescription>
                  Spec target: {perf?.targets.latencyMs.min}–{perf?.targets.latencyMs.max}ms per request
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-2">
                <LatencyBar value={perf?.avgLatencyMs ?? null} min={600} max={1000} label="Average Latency" />
                <LatencyBar value={perf?.p50LatencyMs ?? null} min={600} max={1000} label="P50 (Median)" />
                <LatencyBar value={perf?.p95LatencyMs ?? null} min={600} max={1200} label="P95 Tail Latency" />

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { label: "Min", val: sec(perf?.minLatencyMs ?? null), icon: TrendingUp },
                    { label: "Avg", val: sec(perf?.avgLatencyMs ?? null), icon: Clock, highlight: true },
                    { label: "Max", val: sec(perf?.maxLatencyMs ?? null), icon: Activity },
                  ].map(({ label, val, icon: Icon, highlight }) => (
                    <div key={label} className={`rounded-xl border p-3 text-center ${highlight ? "border-primary/30 bg-primary/5" : "border-border/40 bg-secondary/20"}`}>
                      <Icon className={`h-4 w-4 mx-auto mb-1 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
                      <div className={`text-xl font-bold font-mono ${highlight ? "text-primary" : "text-slate-200"}`}>{val}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Request stats */}
            <div className="space-y-4">
              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex justify-between">
                    Total Requests
                    <StatusBadge ok={perf != null && perf.totalRequests > 0} label="" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold font-mono text-primary">{perf?.totalRequests ?? 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">via Reasoning Agent</p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Throughput Target
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono text-slate-200">
                    {perf?.targets.throughputRps.min}–{perf?.targets.throughputRps.max}
                    <span className="text-sm font-normal text-muted-foreground ml-1">req/s</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Requires vLLM inference engine (Phase 3)</p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    GPU Memory Target
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono text-slate-200">≤16 GB</div>
                  <p className="text-xs text-muted-foreground mt-1">4-bit QLoRA, A100/L4/T4 GPU</p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex justify-between">
                    Latency Status
                    <StatusBadge ok={latencyOk} label="" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-lg font-bold font-mono ${latencyOk ? "text-emerald-400" : "text-primary"}`}>
                    {perf?.avgLatencyMs != null ? `${(perf.avgLatencyMs / 1000).toFixed(2)}s avg` : "No data yet"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Target: 0.60–1.00s</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
