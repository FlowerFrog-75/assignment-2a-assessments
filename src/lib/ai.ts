import { useApiData } from './api';

export interface AiStatus {
  mode: 'claude' | 'offline' | 'off';
  model: string | null;
  label: string;
  markingEnabled: boolean;
}

/** Whether AI is available here, and in which mode (real Claude, offline demo, or not set up). */
export function useAiStatus() {
  return useApiData<AiStatus>('/ai/status', { mode: 'offline', model: 'offline-demo', label: 'Offline demo (not real AI)', markingEnabled: true });
}

export const AI_OFF_MESSAGE = "AI isn't set up on this server. An administrator needs to add ANTHROPIC_API_KEY.";
