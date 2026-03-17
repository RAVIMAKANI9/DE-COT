import { pgTable, serial, integer, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  turnNumber: integer("turn_number").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  reasoning: jsonb("reasoning").notNull(),
  questionType: text("question_type").notNull(),
  confidence: text("confidence").notNull(),
  latencyMs: real("latency_ms").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversationTable).omit({ id: true });
export type Conversation = typeof conversationTable.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
