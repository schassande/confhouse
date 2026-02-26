import { setGlobalOptions } from 'firebase-functions';
import { createPerson } from './http/create-person';
import { importConferenceHall } from './http/import-conference-hall';
import { resetConferenceHallImport } from './http/reset-conference-hall-import';
import { deleteConference } from './http/delete-conference';
import { duplicateConference } from './http/duplicate-conference';
import { refreshConferenceDashboard } from './http/refresh-conference-dashboard';
import { refreshVoxxrinSchedule } from './http/refresh-voxxrin-schedule';
import { recomputeConferenceDashboardDaily } from './scheduler/recompute-conference-dashboard-daily';

setGlobalOptions({ maxInstances: 10 });

export {
  createPerson,
  importConferenceHall,
  resetConferenceHallImport,
  deleteConference,
  duplicateConference,
  refreshConferenceDashboard,
  refreshVoxxrinSchedule,
  recomputeConferenceDashboardDaily,
};
