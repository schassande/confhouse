import { SponsorDocumentConferenceSource, SponsorDocumentSponsorSource } from '../../documents/sponsor-document-model';

/**
 * Sample conference source used by local sponsor document preview scripts.
 */
export const SAMPLE_SPONSOR_DOCUMENT_CONFERENCE: SponsorDocumentConferenceSource = {
  name: 'Snowcamp',
  edition: 2026,
  sponsoring: {
    legalEntity: 'Snowcamp Association',
    address: '1 Place de la Conference, 38000 Grenoble, France',
    email: 'partners@snowcamp.io',
    vat: 'FR00123456789',
    entityId: 'SIRET 123 456 789 00012',
    sponsorTypes: [
      {
        id: 'gold',
        name: 'Gold Sponsorship',
        description: {
          en: 'Premium sponsor package with booth and conference visibility.',
          fr: 'Offre sponsor premium avec stand et visibilite conference.',
        },
        price: 5000,
      },
    ],
  },
};

/**
 * Sample sponsor source used by local sponsor document preview scripts.
 */
export const SAMPLE_SPONSOR_DOCUMENT_SPONSOR: SponsorDocumentSponsorSource = {
  name: 'Example Corp',
  sponsorTypeId: 'gold',
  adminEmails: ['contact@example-corp.test'],
};
