import { pgTable, serial, integer, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelineStatusTable = pgTable("pipeline_status", {
  id: serial("id").primaryKey(),
  currentPhase: integer("current_phase").notNull().default(0),
  overallStatus: text("overall_status").notNull().default("idle"),
  startedAt: timestamp("started_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
  totalDatasetSamples: integer("total_dataset_samples"),
  filteredCoTSamples: integer("filtered_cot_samples"),
});

export const phaseStatusTable = pgTable("phase_status", {
  id: serial("id").primaryKey(),
  phase: integer("phase").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  progress: real("progress"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
});

export const pipelineLogsTable = pgTable("pipeline_logs", {
  id: serial("id").primaryKey(),
  phase: integer("phase"),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  metadata: jsonb("metadata"),
});

export const costTrackingTable = pgTable("cost_tracking", {
  id: serial("id").primaryKey(),
  phase: integer("phase").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const evaluationMetricsTable = pgTable("evaluation_metrics", {
  id: serial("id").primaryKey(),
  benchmark: text("benchmark").notNull(),
  accuracy: real("accuracy").notNull(),
  targetAccuracy: real("target_accuracy").notNull(),
  sampleCount: integer("sample_count").notNull(),
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
  checkpointStep: integer("checkpoint_step"),
});

export const trainingCurveTable = pgTable("training_curve", {
  id: serial("id").primaryKey(),
  step: integer("step").notNull(),
  loss: real("loss").notNull(),
  learningRate: real("learning_rate"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertPipelineStatusSchema = createInsertSchema(pipelineStatusTable);
export const insertPhaseStatusSchema = createInsertSchema(phaseStatusTable);
export const insertPipelineLogSchema = createInsertSchema(pipelineLogsTable).omit({ id: true });
export const insertCostTrackingSchema = createInsertSchema(costTrackingTable).omit({ id: true });
export const insertEvaluationMetricSchema = createInsertSchema(evaluationMetricsTable).omit({ id: true });
export const insertTrainingCurveSchema = createInsertSchema(trainingCurveTable).omit({ id: true });

export type PipelineStatus = typeof pipelineStatusTable.$inferSelect;
export type PhaseStatus = typeof phaseStatusTable.$inferSelect;
export type PipelineLog = typeof pipelineLogsTable.$inferSelect;
export type CostTracking = typeof costTrackingTable.$inferSelect;
export type EvaluationMetric = typeof evaluationMetricsTable.$inferSelect;
export type TrainingCurvePoint = typeof trainingCurveTable.$inferSelect;
export type InsertPipelineLog = z.infer<typeof insertPipelineLogSchema>;
