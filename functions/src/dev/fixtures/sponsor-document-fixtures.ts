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
    legalEntity: 'Snowcamp',
    address: '1 Place de la Conference, 38000 Grenoble, France',
    email: 'team@snowcamp.io',
    vat: '',
    entityId: 'SIRET 123 456 789 00012',
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
};
