import { setGlobalOptions } from 'firebase-functions';
import { createPerson } from './person/create';
import { importConferenceHall } from './integrations/conference-hall/import';
import { resetConferenceHallImport } from './integrations/conference-hall/reset-import';
import { deleteConference } from './conference/lifecycle/delete';
import { duplicateConference } from './conference/lifecycle/duplicate';
import { refreshConferenceDashboard } from './conference/dashboard/refresh';
import { refreshVoxxrinSchedule } from './integrations/voxxrin/refresh-schedule';
import { refreshVoxxrinOccupation } from './integrations/voxxrin/refresh-occupation';
import { fetchBilletweb } from './ticket/billetweb/fetch';
import { recomputeConferenceDashboardDaily } from './scheduler/conference/recompute-dashboard-daily';
import { speakerSessionAction } from './conference/speakers/session-action';
import { allocateSponsorTickets } from './ticket/sponsor/allocate';
import { deleteSponsorParticipantTicket } from './ticket/sponsor/delete';
import { sendSponsorParticipantTicket } from './ticket/sponsor/send';
import { upsertSponsorParticipantTicket } from './ticket/sponsor/upsert';
import { assignSponsorBooth } from './sponsor/status/assign-booth';
import { updateSponsorPaymentStatus } from './sponsor/status/update-payment-status';
import { updateSponsorStatus } from './sponsor/status/update-status';
import { downloadSponsorInvoice } from './sponsor/documents/download-invoice';
import { downloadSponsorPaidInvoice } from './sponsor/documents/download-paid-invoice';
import { downloadSponsorOrderForm } from './sponsor/documents/download-order-form';
import { sendSponsorAdministrativeSummary } from './sponsor/communication/send-administrative-summary';
import { sendSponsorApplicationConfirmation } from './sponsor/communication/send-application-confirmation';
import { sendSponsorInvoice } from './sponsor/communication/send-invoice';
import { sendSponsorPaidInvoice } from './sponsor/communication/send-paid-invoice';
import { sendSponsorOrderForm } from './sponsor/communication/send-order-form';
import { sendSponsorPaymentReminder } from './sponsor/communication/send-payment-reminder';

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
  upsertSponsorParticipantTicket,
  deleteSponsorParticipantTicket,
  sendSponsorParticipantTicket,
  downloadSponsorOrderForm,
  downloadSponsorInvoice,
  downloadSponsorPaidInvoice,
  sendSponsorOrderForm,
  sendSponsorInvoice,
  sendSponsorPaidInvoice,
  sendSponsorPaymentReminder,
  sendSponsorApplicationConfirmation,
  sendSponsorAdministrativeSummary,
  recomputeConferenceDashboardDaily,
};
