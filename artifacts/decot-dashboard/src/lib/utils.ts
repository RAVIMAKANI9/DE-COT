import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export const PHASE_NAMES: Record<number, string> = {
  0: "Environment Setup",
  1: "Dataset Download",
  2: "CoT Generation",
  3: "Filtering & Quality",
  4: "LoRA Fine-tuning",
  5: "Evaluation",
  6: "Deploy & Serve"
};
