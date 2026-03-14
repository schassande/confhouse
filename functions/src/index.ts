import { setGlobalOptions } from 'firebase-functions';
import { createPerson } from './http/create-person';
import { importConferenceHall } from './http/import-conference-hall';
import { resetConferenceHallImport } from './http/reset-conference-hall-import';
import { deleteConference } from './http/delete-conference';
import { duplicateConference } from './http/duplicate-conference';
import { refreshConferenceDashboard } from './http/refresh-conference-dashboard';
import { refreshVoxxrinSchedule } from './http/refresh-voxxrin-schedule';
import { refreshVoxxrinOccupation } from './http/refresh-voxxrin-occupation';
import { fetchBilletweb } from './http/fetch-billetweb';
import { recomputeConferenceDashboardDaily } from './scheduler/recompute-conference-dashboard-daily';
import { speakerSessionAction } from './http/speaker-session-action';
import {
  allocateSponsorTickets,
  assignSponsorBooth,
  downloadSponsorInvoice,
  downloadSponsorOrderForm,
  sendSponsorAdministrativeSummary,
  sendSponsorApplicationConfirmation,
  sendSponsorInvoice,
  sendSponsorOrderForm,
  sendSponsorPaymentReminder,
  updateSponsorPaymentStatus,
  updateSponsorStatus,
} from './http/sponsor-actions';

setGlobalOptions({ maxInstances: 10 });

export {
  createPerson,
  importConferenceHall,
  resetConferenceHallImport,
  deleteConference,
  duplicateConference,
  refreshConferenceDashboard,
  refreshVoxxrinSchedule,
  refreshVoxxrinOccupation,
  fetchBilletweb,
  speakerSessionAction,
  updateSponsorStatus,
  updateSponsorPaymentStatus,
  assignSponsorBooth,
  allocateSponsorTickets,
  downloadSponsorOrderForm,
  downloadSponsorInvoice,
  sendSponsorOrderForm,
  sendSponsorInvoice,
  sendSponsorPaymentReminder,
  sendSponsorApplicationConfirmation,
  sendSponsorAdministrativeSummary,
  recomputeConferenceDashboardDaily,
};
