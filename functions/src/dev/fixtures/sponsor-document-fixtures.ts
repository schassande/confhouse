import { SponsorDocumentConferenceSource, SponsorDocumentSponsorSource } from '../../documents/sponsor-document-model';

/**
 * Sample conference source used by local sponsor document preview scripts.
 */
export const SAMPLE_SPONSOR_DOCUMENT_CONFERENCE: SponsorDocumentConferenceSource = {
  name: 'Snowcamp',
  edition: 2026,
  logo: 'https://snowcamp.io/img/logo/snowcamp.svg',
  days: [
    { dayIndex: 1, date: '2026-01-15' },
    { dayIndex: 2, date: '2026-01-16' },
    { dayIndex: 3, date: '2026-01-17' },
  ],
  sponsoring: {
    counter: 12,
    legalEntity: 'Snowcamp',
    address: '1 Place de la Conference, 38000 Grenoble, France',
    email: 'team@snowcamp.io',
    ccEmail: 'orga@snowcamp.io',
    vatRate: 0.2,
    entityId: 'SIRET 123 456 789 00012',
    bankDetails: {
      iban: 'FR76 1234 5678 9012 3456 7890 123',
      bic: 'AGRIFRPP',
    },
    legalNotes: [
      'Payment due in 30 days.',
      'This document is generated from development fixture data.',
    ],
    sponsorTypes: [
      {
        id: 'etoile',
        name: 'Etoile',
        description: {
          en: 'Premium sponsor package with booth and conference visibility.',
          fr: 'Offre sponsor premium avec stand et visibilité conference.',
        },
        price: 3000,
      },
      {
        id: 'flocon',
        name: 'Flocon',
        description: {
          en: 'Sponsor package with kakemono andconference visibility.',
          fr: 'Offre sponsor avec kakemono et visibilité conference.',
        },
        price: 1250,
      },
    ],
  },
};

/**
 * Sample sponsor source used by local sponsor document preview scripts.
 */
export const SAMPLE_SPONSOR_DOCUMENT_SPONSOR: SponsorDocumentSponsorSource = {
  name: 'Example Corp',
  sponsorTypeId: 'etoile',
  adminEmails: ['contact@example-corp.test'],
  communicationLanguage: 'fr',
  purchaseOrder: 'PO-42',
  address: '42 Avenue des Sponsors, 75010 Paris, France',
  acceptedNumber: 7,
  invoiceDueDate: '2026-02-15',
  documents: {
    orderFormSentAt: '2026-01-10T09:30:00.000Z',
    invoiceSentAt: '2026-01-15T09:30:00.000Z',
    invoicePaidSentAt: '2026-02-20T09:30:00.000Z',
  },
};
