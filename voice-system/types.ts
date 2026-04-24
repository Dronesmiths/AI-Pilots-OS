/**
 * voice-system/types.ts
 *
 * Canonical types for the entire voice system.
 * All API endpoints return VoiceSuccessResponse | VoiceErrorResponse.
 * All events logged as VoiceEvent.
 */

// ── Standardised API responses ─────────────────────────────────────────────

export interface VoiceSuccessResponse {
  success:   true;
  id?:       string;        // message SID, call ID, session ID
  provider:  string;        // "twilio" | "vapi"
  timestamp: number;        // Unix ms
  [key: string]: unknown;   // additional fields per endpoint
}

export interface VoiceErrorResponse {
  success: false;
  error:   string;          // human-readable
  code:    string;          // machine-readable: "TWILIO_ERROR" | "VAPI_ERROR" | "RATE_LIMIT" | etc.
}

// ── Optional call metadata (source tracking) ──────────────────────────────

export interface VoiceCallMeta {
  /** Where the action originated — ties SEO → Voice → Revenue */
  source?:     string;   // e.g. "seo-page" | "crm" | "webhook"
  pageSlug?:   string;   // e.g. "frameless-glass-shower-doors-draper"
  campaignId?: string;   // future: campaign tracking
  clientId?:   string;   // which CRM client triggered this
}

// ── Event shape for the logging layer ────────────────────────────────────

export type VoiceEventType = 'sms' | 'call' | 'chat';
export type VoiceEventStatus = 'success' | 'failed' | 'rate_limited';

export interface VoiceEvent {
  type:      VoiceEventType;
  to:        string;
  status:    VoiceEventStatus;
  provider:  string;
  timestamp: number;
  meta?:     VoiceCallMeta;
  error?:    string;
}

// ── Provider config ───────────────────────────────────────────────────────

export type VoiceProvider = 'twilio' | 'vapi';
