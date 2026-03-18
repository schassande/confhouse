import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { StepperModule } from 'primeng/stepper';
import { Conference } from '../../../model/conference.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { BilletwebApiService, BilletwebEvent, BilletwebTicketTypeOption } from '../../../services/billetweb-api.service';
import { ConferenceSecretService, BILLETWEB_KEY_SECRET_NAME } from '../../../services/conference-secret.service';
import { BilletwebConfig, BilletwebTicketType } from '../../../model/billetweb-config';
import { ConferenceService } from '../../../services/conference.service';

interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-billetweb-config',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    StepperModule,
  ],
  templateUrl: './billetweb-config.component.html',
  styleUrl: './billetweb-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BilletwebConfigComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly translateService = inject(TranslateService);
  private readonly conferenceService = inject(ConferenceService);
  private readonly billetwebConfigService = inject(BilletwebConfigService);
  private readonly conferenceSecretService = inject(ConferenceSecretService);
  private readonly billetwebApiService = inject(BilletwebApiService);

  readonly conferenceId = signal(this.route.snapshot.paramMap.get('conferenceId') ?? '');
  readonly conference = signal<Conference | undefined>(undefined);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly activeStep = signal(1);
  readonly testingConnection = signal(false);
  readonly loadingEvents = signal(false);
  readonly loadingTickets = signal(false);
  readonly connectionTestResultCount = signal<number | null>(null);
  readonly errorMessage = signal('');

  readonly events = signal<BilletwebEvent[]>([]);
  readonly tickets = signal<BilletwebTicketTypeOption[]>([]);
  readonly selectedSponsorTicketTypeIds = signal<string[]>([]);
  readonly protectedSponsorTicketTypeIds = computed<string[]>(() => this.collectProtectedSponsorTicketTypeIds());
  private readonly eventsCache = new Map<string, BilletwebEvent[]>();
  private readonly eventsInFlight = new Map<string, Promise<BilletwebEvent[]>>();
  private previousSponsorTicketTypeIds: string[] = [];
  private restoringSponsorTicketTypes = false;

  readonly form = this.fb.nonNullable.group({
    apiUrl: ['', [Validators.required]],
    userId: ['', [Validators.required]],
    keyVersion: ['', [Validators.required]],
    key: ['', [Validators.required]],
    eventId: ['', [Validators.required]],
    speakerTicketTypeId: ['', [Validators.required]],
    organizerTicketTypeId: ['', [Validators.required]],
    sponsorTicketTypeIds: this.fb.nonNullable.control<string[]>([], [Validators.required]),
  });

  readonly eventOptions = computed<SelectOption[]>(() =>
    this.events().map((event) => ({ label: event.name, value: event.id }))
  );
  readonly ticketOptions = computed<SelectOption[]>(() =>
    this.tickets().map((ticket) => ({
      label: ticket.full_name || ticket.name,
      value: ticket.id,
    }))
  );
  readonly sponsorTicketOptions = computed<SelectOption[]>(() => {
    const protectedIds = new Set(this.protectedSponsorTicketTypeIds());
    const selectedIds = new Set(this.selectedSponsorTicketTypeIds());
    return this.ticketOptions().map((option) => ({
      ...option,
      disabled: protectedIds.has(option.value) && selectedIds.has(option.value),
    }));
  });

  constructor() {
    this.form.controls.eventId.valueChanges.subscribe((eventId) => {
      const normalized = String(eventId ?? '').trim();
      this.form.patchValue(
        {
          speakerTicketTypeId: '',
          organizerTicketTypeId: '',
          sponsorTicketTypeIds: [],
        },
        { emitEvent: false }
      );
      this.previousSponsorTicketTypeIds = [];
      this.selectedSponsorTicketTypeIds.set([]);
      this.tickets.set([]);
      if (normalized) {
        void this.loadTickets(normalized);
      }
    });
    this.form.controls.sponsorTicketTypeIds.valueChanges.subscribe((ticketTypeIds) => {
      this.handleSponsorTicketTypeIdsChange(ticketTypeIds);
    });
    this.form.valueChanges
      .pipe(
        map(() => this.getConnectionSignature()),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe((signature) => {
        if (signature) {
          void this.preloadEvents();
        }
      });
    void this.initialize();
  }

  /**
   * Tests the BilletWeb connection by loading visible events.
   *
   * @returns Promise resolved once the UI feedback is updated.
   */
  async testConnection(): Promise<void> {
    this.errorMessage.set('');
    this.connectionTestResultCount.set(null);
    if (!this.canGoToStep2()) {
      this.form.controls.apiUrl.markAsTouched();
      this.form.controls.userId.markAsTouched();
      this.form.controls.keyVersion.markAsTouched();
      this.form.controls.key.markAsTouched();
      return;
    }

    this.testingConnection.set(true);
    try {
      const events = await this.fetchEvents();
      this.connectionTestResultCount.set(events.length);
    } catch (error: unknown) {
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.testingConnection.set(false);
    }
  }

  /**
   * Goes back to the previous wizard step.
   */
  previousStep(): void {
    this.errorMessage.set('');
    this.activeStep.update((step) => Math.max(1, step - 1));
  }

  /**
   * Validates the current step and advances the wizard.
   *
   * @returns Promise resolved when asynchronous loading is complete.
   */
  async nextStep(): Promise<void> {
    this.errorMessage.set('');
    const step = this.activeStep();
    if (step === 1) {
      if (!this.canGoToStep2()) {
        this.form.controls.apiUrl.markAsTouched();
        this.form.controls.userId.markAsTouched();
        this.form.controls.keyVersion.markAsTouched();
        this.form.controls.key.markAsTouched();
        return;
      }
      await this.loadEvents();
      this.activeStep.set(2);
      return;
    }

    if (step === 2) {
      if (!this.canGoToStep3()) {
        this.form.controls.eventId.markAsTouched();
        return;
      }
      this.activeStep.set(3);
    }
  }

  /**
   * Forces a reload of the BilletWeb events list.
   *
   * @returns Promise resolved when the reload completes.
   */
  async refreshEvents(): Promise<void> {
    await this.loadEvents(true);
  }

  /**
   * Persists the BilletWeb configuration and secret key.
   *
   * @returns Promise resolved when the save flow is finished.
   */
  async save(): Promise<void> {
    this.errorMessage.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }

    const raw = this.form.getRawValue();
    this.saving.set(true);
    try {
      const payload: Partial<BilletwebConfig> = {
        conferenceId,
        apiUrl: raw.apiUrl.trim(),
        userId: raw.userId.trim(),
        keyVersion: raw.keyVersion.trim(),
        eventId: raw.eventId.trim(),
        ticketTypes: {
          speaker: this.toTicketType(raw.speakerTicketTypeId),
          organizer: this.toTicketType(raw.organizerTicketTypeId),
          sponsors: this.toTicketTypes(raw.sponsorTicketTypeIds),
        },
      };

      await firstValueFrom(this.billetwebConfigService.saveByConferenceId(conferenceId, payload));
      await firstValueFrom(
        this.conferenceSecretService.saveByConferenceAndName(conferenceId, BILLETWEB_KEY_SECRET_NAME, raw.key.trim())
      );
      await this.router.navigate(['/conference', conferenceId, 'manage']);
    } catch (error: unknown) {
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Cancels the edition and returns to the conference management page.
   *
   * @returns Promise resolved once navigation completes.
   */
  async cancel(): Promise<void> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }
    await this.router.navigate(['/conference', conferenceId, 'manage']);
  }

  /**
   * Loads conference data, BilletWeb configuration and secret values.
   *
   * @returns Promise resolved when initialization is complete.
   */
  private async initialize(): Promise<void> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      this.loading.set(false);
      return;
    }

    try {
      const conference = await firstValueFrom(this.conferenceService.byId(conferenceId));
      this.conference.set(conference);

      const config = await firstValueFrom(this.billetwebConfigService.findByConferenceId(conferenceId));
      const secret = await firstValueFrom(
        this.conferenceSecretService.findByConferenceAndName(conferenceId, BILLETWEB_KEY_SECRET_NAME)
      );

      this.form.patchValue(
        {
          apiUrl: String(config?.apiUrl ?? ''),
          userId: String(config?.userId ?? ''),
          keyVersion: String(config?.keyVersion ?? ''),
          key: String(secret?.secretValue ?? ''),
          eventId: String(config?.eventId ?? ''),
        },
        { emitEvent: false }
      );

      if (config?.eventId) {
        await this.loadEvents();
        await this.loadTickets(config.eventId);
        const sponsorTicketTypeIds = this.normalizeTicketTypeIds(
          (config.ticketTypes?.sponsors ?? []).map((ticketType) => ticketType.ticketTypeId)
        );
        this.form.patchValue(
          {
            speakerTicketTypeId: String(config.ticketTypes?.speaker?.ticketTypeId ?? ''),
            organizerTicketTypeId: String(config.ticketTypes?.organizer?.ticketTypeId ?? ''),
            sponsorTicketTypeIds,
          },
          { emitEvent: false }
        );
        this.previousSponsorTicketTypeIds = sponsorTicketTypeIds;
        this.selectedSponsorTicketTypeIds.set(sponsorTicketTypeIds);
      } else {
        this.previousSponsorTicketTypeIds = [];
        this.selectedSponsorTicketTypeIds.set([]);
        void this.preloadEvents();
      }
    } catch (error: unknown) {
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Preloads the event list when connection fields become valid.
   *
   * @returns Promise resolved when preload completes or is skipped.
   */
  private async preloadEvents(): Promise<void> {
    if (!this.canGoToStep2()) {
      return;
    }
    try {
      await this.getOrLoadEvents(false);
    } catch {
      // Keep preload silent; explicit actions surface errors.
    }
  }

  /**
   * Loads the list of events from BilletWeb.
   *
   * @param forceReload Whether the cache should be bypassed.
   * @returns Promise resolved when loading completes.
   */
  private async loadEvents(forceReload = false): Promise<void> {
    if (!this.canGoToStep2()) {
      return;
    }
    this.loadingEvents.set(true);
    this.errorMessage.set('');
    try {
      const events = await this.getOrLoadEvents(forceReload);
      this.events.set(events);
    } catch (error: unknown) {
      this.events.set([]);
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.loadingEvents.set(false);
    }
  }

  /**
   * Reads the event list from cache or BilletWeb.
   *
   * @param forceReload Whether the cache should be bypassed.
   * @returns Promise resolved with the event list.
   */
  private async getOrLoadEvents(forceReload: boolean): Promise<BilletwebEvent[]> {
    const signature = this.getConnectionSignature();
    if (!signature) {
      return [];
    }

    if (!forceReload) {
      const cached = this.eventsCache.get(signature);
      if (cached) {
        return cached;
      }
      const inFlight = this.eventsInFlight.get(signature);
      if (inFlight) {
        return await inFlight;
      }
    } else {
      this.eventsCache.delete(signature);
    }

    const promise = this.fetchEvents();
    this.eventsInFlight.set(signature, promise);
    try {
      const events = await promise;
      this.eventsCache.set(signature, events);
      return events;
    } finally {
      this.eventsInFlight.delete(signature);
    }
  }

  /**
   * Builds a stable cache key for the current BilletWeb credentials.
   *
   * @returns Cache key or an empty string when credentials are incomplete.
   */
  private getConnectionSignature(): string {
    const raw = this.form.getRawValue();
    const apiUrl = raw.apiUrl.trim();
    const userId = raw.userId.trim();
    const keyVersion = raw.keyVersion.trim();
    const key = raw.key.trim();
    if (!apiUrl || !userId || !keyVersion || !key) {
      return '';
    }
    return `${apiUrl}|${userId}|${keyVersion}|${key}`;
  }

  /**
   * Fetches BilletWeb events through the backend proxy.
   *
   * @returns Promise resolved with the available events.
   */
  private async fetchEvents(): Promise<BilletwebEvent[]> {
    const conferenceId = this.conferenceId();
    const raw = this.form.getRawValue();
    return await this.billetwebApiService.listEvents({
      conferenceId,
      apiUrl: raw.apiUrl.trim(),
      userId: raw.userId.trim(),
      keyVersion: raw.keyVersion.trim(),
      key: raw.key.trim(),
    });
  }

  /**
   * Fetches BilletWeb ticket types for one selected event.
   *
   * @param eventId BilletWeb event identifier.
   * @returns Promise resolved when the tickets are loaded.
   */
  private async loadTickets(eventId: string): Promise<void> {
    this.loadingTickets.set(true);
    this.errorMessage.set('');
    try {
      const conferenceId = this.conferenceId();
      const raw = this.form.getRawValue();
      const tickets = await this.billetwebApiService.listTickets({
        conferenceId,
        apiUrl: raw.apiUrl.trim(),
        userId: raw.userId.trim(),
        keyVersion: raw.keyVersion.trim(),
        key: raw.key.trim(),
        eventId: eventId.trim(),
      });
      this.tickets.set(tickets);
    } catch (error: unknown) {
      this.tickets.set([]);
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.loadingTickets.set(false);
    }
  }

  /**
   * Reacts to sponsor ticket selection changes and restores protected values when required.
   *
   * @param ticketTypeIds Latest selected sponsor ticket type ids.
   */
  private handleSponsorTicketTypeIdsChange(ticketTypeIds: string[] | null | undefined): void {
    if (this.restoringSponsorTicketTypes) {
      return;
    }

    const nextIds = this.normalizeTicketTypeIds(ticketTypeIds ?? []);
    const previousIds = this.previousSponsorTicketTypeIds;
    const protectedIds = new Set(this.protectedSponsorTicketTypeIds());
    const removedProtectedIds = previousIds.filter((ticketTypeId) => protectedIds.has(ticketTypeId) && !nextIds.includes(ticketTypeId));

    if (removedProtectedIds.length > 0) {
      this.restoringSponsorTicketTypes = true;
      const restoredIds = this.normalizeTicketTypeIds([...nextIds, ...removedProtectedIds]);
      this.form.controls.sponsorTicketTypeIds.setValue(restoredIds, { emitEvent: false });
      this.restoringSponsorTicketTypes = false;
      this.errorMessage.set(
        this.translateService.instant('CONFERENCE.CONFIG.BILLETWEB.SPONSOR_TICKETS_IN_USE_ERROR')
      );
      this.previousSponsorTicketTypeIds = restoredIds;
      this.selectedSponsorTicketTypeIds.set(restoredIds);
      return;
    }

    this.previousSponsorTicketTypeIds = nextIds;
    this.selectedSponsorTicketTypeIds.set(nextIds);
  }

  /**
   * Converts one selected BilletWeb ticket type id into a persisted ticket object.
   *
   * @param ticketTypeId Selected BilletWeb ticket type id.
   * @returns Persisted ticket type payload.
   */
  private toTicketType(ticketTypeId: string): BilletwebTicketType {
    const id = String(ticketTypeId ?? '').trim();
    const ticket = this.tickets().find((entry) => String(entry.id) === id);
    return {
      ticketTypeId: id,
      ticketTypeName: String(ticket?.full_name || ticket?.name || ''),
    };
  }

  /**
   * Converts several selected BilletWeb ticket ids into persisted ticket objects.
   *
   * @param ticketTypeIds Selected BilletWeb ticket ids.
   * @returns Persisted sponsor ticket types.
   */
  private toTicketTypes(ticketTypeIds: string[]): BilletwebTicketType[] {
    return this.normalizeTicketTypeIds(ticketTypeIds)
      .map((ticketTypeId) => this.toTicketType(ticketTypeId))
      .filter((ticketType) => ticketType.ticketTypeId.length > 0);
  }

  /**
   * Normalizes one list of ticket type ids by trimming and deduplicating values.
   *
   * @param ticketTypeIds Raw ids.
   * @returns Normalized ids in BilletWeb ticket order.
   */
  private normalizeTicketTypeIds(ticketTypeIds: string[]): string[] {
    const selectedIds = new Set(
      (ticketTypeIds ?? [])
        .map((ticketTypeId) => String(ticketTypeId ?? '').trim())
        .filter((ticketTypeId) => ticketTypeId.length > 0)
    );
    const orderedIds = this.tickets()
      .map((ticket) => String(ticket.id))
      .filter((ticketTypeId) => selectedIds.has(ticketTypeId));
    const remainingIds = Array.from(selectedIds).filter((ticketTypeId) => !orderedIds.includes(ticketTypeId));
    return [...orderedIds, ...remainingIds];
  }

  /**
   * Collects sponsor ticket type ids already referenced by sponsor quotas.
   *
   * @returns Protected BilletWeb ticket type ids.
   */
  private collectProtectedSponsorTicketTypeIds(): string[] {
    const ids = new Set<string>();
    (this.conference()?.sponsoring?.sponsorTypes ?? []).forEach((sponsorType) => {
      (sponsorType.conferenceTicketQuotas ?? []).forEach((quota) => {
        const ticketTypeId = String(quota.conferenceTicketTypeId ?? '').trim();
        if (ticketTypeId) {
          ids.add(ticketTypeId);
        }
      });
    });
    return Array.from(ids).sort((left, right) => left.localeCompare(right));
  }

  /**
   * Converts one thrown error into a user-facing message.
   *
   * @param error Unknown error payload.
   * @returns User-facing message.
   */
  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    const anyError = error as { error?: { error?: string; detail?: string } };
    return String(anyError?.error?.error ?? anyError?.error?.detail ?? 'Unknown error');
  }

  /**
   * Returns whether the first step is valid enough to continue.
   *
   * @returns `true` when BilletWeb credentials are complete.
   */
  protected canGoToStep2(): boolean {
    const raw = this.form.getRawValue();
    return !!raw.apiUrl.trim() && !!raw.userId.trim() && !!raw.keyVersion.trim() && !!raw.key.trim();
  }

  /**
   * Returns whether the event selection step can continue.
   *
   * @returns `true` when an event is selected.
   */
  protected canGoToStep3(): boolean {
    return !!String(this.form.controls.eventId.value ?? '').trim();
  }

  /**
   * Returns whether the full form can be saved.
   *
   * @returns `true` when the form is valid and not currently saving.
   */
  protected canSave(): boolean {
    return this.form.valid && !this.saving();
  }
}
