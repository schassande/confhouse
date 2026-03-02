import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { StepperModule } from 'primeng/stepper';
import { Conference } from '../../../model/conference.model';
import { BilletwebConfigService } from '../../../services/billetweb-config.service';
import { BilletwebApiService, BilletwebEvent, BilletwebTicketTypeOption } from '../../../services/billetweb-api.service';
import { ConferenceSecretService, BILLETWEB_KEY_SECRET_NAME } from '../../../services/conference-secret.service';
import { BilletwebConfig, BilletwebTicketType } from '../../../model/billetweb-config';
import { ConferenceService } from '../../../services/conference.service';

@Component({
  selector: 'app-billetweb-config',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
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
  private readonly eventsCache = new Map<string, BilletwebEvent[]>();
  private readonly eventsInFlight = new Map<string, Promise<BilletwebEvent[]>>();

  readonly form = this.fb.nonNullable.group({
    apiUrl: ['', [Validators.required]],
    userId: ['', [Validators.required]],
    keyVersion: ['', [Validators.required]],
    key: ['', [Validators.required]],
    eventId: ['', [Validators.required]],
    speakerTicketTypeId: ['', [Validators.required]],
    organizerTicketTypeId: ['', [Validators.required]],
    sponsorConferenceTicketTypeId: ['', [Validators.required]],
    sponsorStandTicketTypeId: ['', [Validators.required]],
  });

  readonly eventOptions = computed(() => this.events().map((event) => ({ label: event.name, value: event.id })));
  readonly ticketOptions = computed(() => this.tickets().map((ticket) => ({ label: ticket.full_name || ticket.name, value: ticket.id })));

  constructor() {
    this.form.controls.eventId.valueChanges.subscribe((eventId) => {
      const normalized = String(eventId ?? '').trim();
      this.form.patchValue({
        speakerTicketTypeId: '',
        organizerTicketTypeId: '',
        sponsorConferenceTicketTypeId: '',
        sponsorStandTicketTypeId: '',
      }, { emitEvent: false });
      this.tickets.set([]);
      if (normalized) {
        void this.loadTickets(normalized);
      }
    });
    this.form.valueChanges.pipe(
      map(() => this.getConnectionSignature()),
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe((signature) => {
      if (signature) {
        void this.preloadEvents();
      }
    });
    void this.initialize();
  }

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

  previousStep(): void {
    this.errorMessage.set('');
    this.activeStep.update((step) => Math.max(1, step - 1));
  }

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

  async refreshEvents(): Promise<void> {
    await this.loadEvents(true);
  }

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
          sponsorConference: this.toTicketType(raw.sponsorConferenceTicketTypeId),
          sponsorStand: this.toTicketType(raw.sponsorStandTicketTypeId),
        },
      };

      await firstValueFrom(this.billetwebConfigService.saveByConferenceId(conferenceId, payload));
      await firstValueFrom(
        this.conferenceSecretService.saveByConferenceAndName(
          conferenceId,
          BILLETWEB_KEY_SECRET_NAME,
          raw.key.trim()
        )
      );
      await this.router.navigate(['/conference', conferenceId, 'manage']);
    } catch (error: unknown) {
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async cancel(): Promise<void> {
    const conferenceId = this.conferenceId();
    if (!conferenceId) {
      return;
    }
    await this.router.navigate(['/conference', conferenceId, 'manage']);
  }

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

      this.form.patchValue({
        apiUrl: String(config?.apiUrl ?? ''),
        userId: String(config?.userId ?? ''),
        keyVersion: String(config?.keyVersion ?? ''),
        key: String(secret?.secretValue ?? ''),
        eventId: String(config?.eventId ?? ''),
      }, { emitEvent: false });

      if (config?.eventId) {
        await this.loadEvents();
        await this.loadTickets(config.eventId);
        this.form.patchValue({
          speakerTicketTypeId: String(config.ticketTypes?.speaker?.ticketTypeId ?? ''),
          organizerTicketTypeId: String(config.ticketTypes?.organizer?.ticketTypeId ?? ''),
          sponsorConferenceTicketTypeId: String(config.ticketTypes?.sponsorConference?.ticketTypeId ?? ''),
          sponsorStandTicketTypeId: String(config.ticketTypes?.sponsorStand?.ticketTypeId ?? ''),
        }, { emitEvent: false });
      } else {
        void this.preloadEvents();
      }
    } catch (error: unknown) {
      this.errorMessage.set(this.toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async preloadEvents(): Promise<void> {
    if (!this.canGoToStep2()) {
      return;
    }
    try {
      await this.getOrLoadEvents(false);
    } catch {
      // Keep preload silent; explicit actions (test/next/refresh) surface errors.
    }
  }

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

  private toTicketType(ticketTypeId: string): BilletwebTicketType {
    const id = String(ticketTypeId ?? '').trim();
    const ticket = this.tickets().find((entry) => String(entry.id) === id);
    return {
      ticketTypeId: id,
      ticketTypeName: String(ticket?.full_name || ticket?.name || ''),
    };
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    const anyError = error as { error?: { error?: string; detail?: string } };
    return String(anyError?.error?.error ?? anyError?.error?.detail ?? 'Unknown error');
  }

  protected canGoToStep2(): boolean {
    const raw = this.form.getRawValue();
    return !!raw.apiUrl.trim() && !!raw.userId.trim() && !!raw.keyVersion.trim() && !!raw.key.trim();
  }

  protected canGoToStep3(): boolean {
    return !!String(this.form.controls.eventId.value ?? '').trim();
  }

  protected canSave(): boolean {
    return this.form.valid && !this.saving();
  }
}
