import { Injectable, inject } from '@angular/core';
import {
  ConferenceAdminService,
  SpeakerSessionDecision,
  SpeakerSessionActionReport,
} from './conference-admin.service';
import { Session, SessionAllocation } from '../model/session.model';
import { SessionDeallocationResult } from './session-allocation.service';

export type { SpeakerSessionDecision };


export interface SpeakerSessionManagementInput {
  conferenceId: string;
  session: Session;
  speakerId: string;
  decision: SpeakerSessionDecision;
}

export interface SpeakerSessionManagementResult {
  updatedSession: Session;
  deallocation: SessionDeallocationResult;
  removedFromConferenceSpeakerIds: string[];
  dashboardRefreshFailed: boolean;
}

/**
 * Encapsulates speaker-driven session cancellation / withdrawal business rules.
 */
@Injectable({ providedIn: 'root' })
export class SpeakerSessionManagementService {
  private readonly conferenceAdminService = inject(ConferenceAdminService);

  /**
   * Cancels a session or removes one speaker from it via server-side controlled workflow.
   *
   * @param input Action context.
   * @returns Update result and side effects summary.
   */
  async processSpeakerSessionDecision(input: SpeakerSessionManagementInput): Promise<SpeakerSessionManagementResult> {
    const conferenceId = String(input.conferenceId ?? '').trim();
    const speakerId = String(input.speakerId ?? '').trim();
    const sessionId = String(input.session?.id ?? '').trim();

    if (!conferenceId || !speakerId || !sessionId || !input.session.conference) {
      throw new Error('Invalid speaker session management input');
    }
    const report = await this.conferenceAdminService.speakerSessionAction({
      conferenceId,
      sessionId,
      decision: input.decision,
    });
    return this.normalizeReport(report);
  }

  /**
   * Normalizes a server action report into strongly typed frontend models.
   *
   * @param report Raw report returned by the server function.
   * @returns Typed result consumed by UI components.
   */
  private normalizeReport(report: SpeakerSessionActionReport): SpeakerSessionManagementResult {
    return {
      updatedSession: report.updatedSession as unknown as Session,
      deallocation: {
        deallocatedAllocations: (report.deallocation?.deallocatedAllocations ?? []) as unknown as SessionAllocation[],
        updatedSessions: (report.deallocation?.updatedSessions ?? []) as unknown as Session[],
      },
      removedFromConferenceSpeakerIds: [...(report.removedFromConferenceSpeakerIds ?? [])],
      dashboardRefreshFailed: !!report.dashboardRefreshFailed,
    };
  }
}
