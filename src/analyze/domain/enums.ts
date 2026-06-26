// Single source of truth for every enum in the spec.
// Spelling MUST match the problem statement exactly — variants are scored as schema violations.

export const LANGUAGES = ['en', 'bn', 'mixed'] as const;
export const CHANNELS = ['in_app_chat', 'call_center', 'email', 'merchant_portal', 'field_agent'] as const;
export const USER_TYPES = ['customer', 'merchant', 'agent', 'unknown'] as const;
export const TRANSACTION_TYPES = ['transfer', 'payment', 'cash_in', 'cash_out', 'settlement', 'refund'] as const;
export const TRANSACTION_STATUSES = ['completed', 'failed', 'pending', 'reversed'] as const;

export const EVIDENCE_VERDICTS = ['consistent', 'inconsistent', 'insufficient_data'] as const;

export const CASE_TYPES = [
  'wrong_transfer',
  'payment_failed',
  'refund_request',
  'duplicate_payment',
  'merchant_settlement_delay',
  'agent_cash_in_issue',
  'phishing_or_social_engineering',
  'other',
] as const;

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export const DEPARTMENTS = [
  'customer_support',
  'dispute_resolution',
  'payments_ops',
  'merchant_operations',
  'agent_operations',
  'fraud_risk',
] as const;

export type Language = (typeof LANGUAGES)[number];
export type Channel = (typeof CHANNELS)[number];
export type UserType = (typeof USER_TYPES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type EvidenceVerdict = (typeof EVIDENCE_VERDICTS)[number];
export type CaseType = (typeof CASE_TYPES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Department = (typeof DEPARTMENTS)[number];
