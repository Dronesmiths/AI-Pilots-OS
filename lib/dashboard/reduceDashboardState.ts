/**
 * lib/dashboard/reduceDashboardState.ts
 *
 * Pure state reducer — the single merge path for all dashboard state changes.
 * Used by useDashboardSession to apply bootstrap, replay, and live events.
 *
 * All deduplication lives here:
 *   activity_new / activity_batch → deduped by ActivityItem.id
 *   win_new                       → deduped by WinItem.id
 *   summary_update                → deep-merge (last write wins per field)
 *   autopilot_toggle              → replaces enabled + mode
 *   onboarding_update             → deep-merge (last write wins per field)
 *
 * Sequence check is done BEFORE calling this function (in shouldApplyEvent).
 * The reducer assumes the event is valid and should be applied.
 */
import type {
  DashboardBootstrap,
  ActivityItem,
  WinItem,
} from '@/types/dashboard';

export type ReducibleEvent =
  | { type: 'summary_update';    sequence?: number; payload: Partial<DashboardBootstrap['summary']>  }
  | { type: 'activity_new';      sequence?: number; payload: ActivityItem                           }
  | { type: 'activity_batch';    sequence?: number; payload: ActivityItem[]                         }
  | { type: 'win_new';           sequence?: number; payload: WinItem                                }
  | { type: 'autopilot_toggle';  sequence?: number; payload: { enabled: boolean; mode?: string }   }
  | { type: 'onboarding_update'; sequence?: number; payload: Partial<DashboardBootstrap['onboarding']> };

export function reduceDashboardState(
  state: DashboardBootstrap,
  event: ReducibleEvent,
): DashboardBootstrap {
  switch (event.type) {

    case 'summary_update':
      return { ...state, summary: { ...state.summary, ...event.payload } };

    case 'activity_new': {
      if (state.activity.some(a => a.id === event.payload.id)) return state;
      return { ...state, activity: [event.payload, ...state.activity].slice(0, 10) };
    }

    case 'activity_batch': {
      const existingIds = new Set(state.activity.map(a => a.id));
      const incoming    = event.payload.filter(a => !existingIds.has(a.id));
      if (!incoming.length) return state;
      return { ...state, activity: [...incoming, ...state.activity].slice(0, 10) };
    }

    case 'win_new': {
      if (state.wins.some(w => w.id === event.payload.id)) return state;
      return { ...state, wins: [event.payload, ...state.wins].slice(0, 6) };
    }

    case 'autopilot_toggle':
      return {
        ...state,
        summary: {
          ...state.summary,
          autopilotEnabled: event.payload.enabled,
          ...(event.payload.mode ? { autopilotMode: event.payload.mode as DashboardBootstrap['summary']['autopilotMode'] } : {}),
        },
      };

    case 'onboarding_update':
      return { ...state, onboarding: { ...state.onboarding, ...event.payload } };

    default:
      return state;
  }
}
