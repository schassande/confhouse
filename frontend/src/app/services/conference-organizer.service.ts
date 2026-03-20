import { Injectable } from '@angular/core';
import { Conference } from '@shared/model/conference.model';

@Injectable({ providedIn: 'root' })
export class ConferenceOrganizerService {
  isConferenceOrganizer(conference: Conference | null | undefined, email: string | null | undefined): boolean {
    const normalizedEmail = this.normalizeEmail(email);
    if (!conference || !normalizedEmail) {
      return false;
    }

    const organizerEmails = (conference.organizerEmails ?? []).map((value) => this.normalizeEmail(value));
    if (organizerEmails.includes(normalizedEmail)) {
      return true;
    }

    const organizerDomain = this.normalizeDomain(conference.organizerEmailDomain);
    if (!organizerDomain) {
      return false;
    }

    return this.extractDomain(normalizedEmail) === organizerDomain;
  }

  normalizeEmail(email: string | null | undefined): string {
    return String(email ?? '').trim().toLowerCase();
  }

  normalizeDomain(domain: string | null | undefined): string {
    return String(domain ?? '').trim().toLowerCase().replace(/^@+/, '');
  }

  extractDomain(email: string | null | undefined): string {
    const normalizedEmail = this.normalizeEmail(email);
    const atIndex = normalizedEmail.lastIndexOf('@');
    if (atIndex < 0 || atIndex === normalizedEmail.length - 1) {
      return '';
    }
    return normalizedEmail.slice(atIndex + 1);
  }
}

