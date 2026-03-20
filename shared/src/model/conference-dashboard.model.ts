import { PersistentData } from './persistant.model';

export type DashboardRefreshTrigger = 'MANUAL_REFRESH' | 'SCHEDULED_DAILY' | 'AUTO_EVENT';

export interface DashboardCountsBySessionType {
  total: number;
  bySessionTypeId: Record<string, number>;
}

export interface ConferenceDashboard extends PersistentData {
  conferenceId: string;
  schemaVersion: number;
  trigger: DashboardRefreshTrigger;
  computedAt: string;
  submitted: DashboardCountsBySessionType;
  confirmed: DashboardCountsBySessionType;
  allocated: DashboardCountsBySessionType;
  speakers: {
    total: number;
    sessionsWith2Speakers: number;
    sessionsWith3Speakers: number;
  };
  slots: {
    allocated: number;
    total: number;
    ratio: number;
  };
  conferenceHall: {
    lastImportAt: string;
  };
  schedule: {
    conferenceStartDate: string;
    daysBeforeConference: number;
  };
}
