export type {
  SponsorBusinessEvent,
  SponsorBusinessEventType,
  SponsorCommunicationLanguage,
  SponsorDocuments,
  SponsorLogistics,
  SponsorPaymentStatus,
  SponsorStatus,
} from '../../../shared/src/model/sponsor.model';

import type {
  SponsorBusinessEvent,
  SponsorCommunicationLanguage,
  SponsorDocuments,
  SponsorLogistics,
  SponsorPaymentStatus,
  SponsorStatus,
} from '../../../shared/src/model/sponsor.model';

/**
 * Minimal backend sponsor shape required by helper functions.
 */
export interface SponsorRecord {
  status: SponsorStatus;
  statusDate: string;
  paymentStatus: SponsorPaymentStatus;
  paymentStatusDate: string;
  communicationLanguage?: SponsorCommunicationLanguage;
  purchaseOrder?: string;
  acceptedNumber?: number;
  businessEvents?: SponsorBusinessEvent[];
  documents?: SponsorDocuments;
  logistics?: SponsorLogistics;
}
