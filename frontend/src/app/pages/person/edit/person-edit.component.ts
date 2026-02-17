import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { Person, SocialLink } from '../../../model/person.model';
import { PersonService } from '../../../services/person.service';
import { UserSignService } from '../../../services/usersign.service';

@Component({
  selector: 'app-person-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    CheckboxModule,
    SelectModule,
  ],
  templateUrl: './person-edit.component.html',
  styleUrls: ['./person-edit.component.css'],
})
export class PersonEditComponent {
  private readonly personService = inject(PersonService);
  private readonly userSign = inject(UserSignService);

  // Dialog state
  readonly visible = signal(false);
  readonly loading = signal(false);

  // Current person being edited (deep copy to avoid mutations)
  readonly editingPerson = signal<Person | null>(null);

  // Language options for dropdown
  readonly languageOptions = signal([
    { label: 'English', value: 'en', icon: 'assets/flags/en.svg' },
    { label: 'Français', value: 'fr', icon: 'assets/flags/fr.svg' }
  ]);

  // Whether the current logged in user is platform admin (controls editing of isPlatformAdmin)
  readonly isCurrentUserAdmin = computed(() => {
    const p = this.userSign.person();
    return !!p && !!p.isPlatformAdmin;
  });

  /**
   * Open the edit dialog for a person
   */
  openEdit(person: Person): void {
    // Deep copy to avoid mutations while editing
    this.editingPerson.set(this.deepCopyPerson(person));
    this.visible.set(true);
  }

  /**
   * Close the dialog without saving
   */
  closeDialog(): void {
    this.visible.set(false);
    this.editingPerson.set(null);
  }

  /**
   * Save the person and close the dialog
   */
  async savePerson(): Promise<void> {
    const person = this.editingPerson();
    if (!person) return;

    try {
      this.loading.set(true);
      // PersonService.save() automatically computes the search field
      await new Promise<Person>((resolve, reject) => {
        this.personService.save(person).subscribe({
          next: (saved) => resolve(saved),
          error: (err) => reject(err),
        });
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error saving person:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deep copy a person object to avoid mutations
   */
  private deepCopyPerson(person: Person): Person {
    return {
      ...person,
      speaker: person.speaker
        ? {
            company: person.speaker.company,
            bio: person.speaker.bio,
            reference: person.speaker.reference,
            photoUrl: person.speaker.photoUrl,
            conferenceHallId: person.speaker.conferenceHallId,
            submittedConferenceIds: [...(person.speaker.submittedConferenceIds ?? [])],
            socialLinks: person.speaker.socialLinks
              ? person.speaker.socialLinks.map((sl) => ({ ...sl }))
              : [],
          }
        : undefined,
    };
  }

  /**
   * Add a social link to the speaker
   */
  addSocialLink(): void {
    const person = this.editingPerson();
    if (!person) return;

    const speaker = this.ensureSpeaker(person);
    speaker.socialLinks.push({ network: '', url: '' });
    this.editingPerson.set({ ...person }); // Trigger reactivity
  }

  /**
   * Remove a social link from the speaker
   */
  removeSocialLink(index: number): void {
    const person = this.editingPerson();
    if (!person || !person.speaker?.socialLinks) return;

    person.speaker.socialLinks.splice(index, 1);
    this.editingPerson.set({ ...person }); // Trigger reactivity
  }

  /**
   * Enable speaker profile for the person by initializing the speaker object with empty fields
   */
  enableSpeaker(): void {
    const person = this.editingPerson();
    if (!person) return;

    this.ensureSpeaker(person);
    this.editingPerson.set({ ...person }); // Trigger reactivity
  }

  private ensureSpeaker(person: Person): NonNullable<Person['speaker']> {
    if (!person.speaker) {
      person.speaker = {
        company: '',
        bio: '',
        reference: '',
        photoUrl: '',
        socialLinks: [],
        submittedConferenceIds: [],
      };
      return person.speaker;
    }

    if (!Array.isArray(person.speaker.socialLinks)) {
      person.speaker.socialLinks = [];
    }
    if (!Array.isArray(person.speaker.submittedConferenceIds)) {
      person.speaker.submittedConferenceIds = [];
    }

    return person.speaker;
  }
}
