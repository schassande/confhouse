import { ChangeDetectionStrategy, Component, computed, effect, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Person } from '../../../model/person.model';
import { PersonService } from '../../../services/person.service';
import { UserSignService } from '../../../services/usersign.service';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-person-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ButtonModule, TableModule],
  templateUrl: './person-list.component.html',
  styleUrls: ['./person-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PersonListComponent implements OnInit {
  private readonly personService = inject(PersonService);
  private readonly signupService = inject(UserSignService);
  private readonly router = inject(Router);

  // Current page items
  private readonly _persons = signal<Person[]>([]);
  persons = computed(() => this._persons());

  // Cache pages for quick navigation
  private readonly pagesCache = new Map<number, Person[]>();
  private readonly cursors = new Map<number, string | undefined>();

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);

  // Search term
  readonly searchTerm = signal('');

  // Effect: if user changes and is no longer admin, redirect (must be in field initializer for injection context)
  private readonly redirectOnNonAdmin = effect(() => {
    const p = this.signupService.person();
    if (!p || !p.isPlatformAdmin) {
      void this.router.navigate(['/']);
    }
  });

  ngOnInit(): void {
    // Prevent access if not admin
    const current = this.signupService.getCurrentPerson();
    if (!current || !current.isPlatformAdmin) {
      void this.router.navigate(['/']);
      return;
    }

    // Initial load page 1 with empty search
    void this.loadPage(1);
  }

  private async loadPage(page: number) {
    if (this.pagesCache.has(page)) {
      this._persons.set(this.pagesCache.get(page) || []);
      this.currentPage.set(page);
      return;
    }

    // Get cursor for this page
    let cursor: string | undefined;
    if (page === 1) {
      cursor = undefined;
    } else {
      const prevPage = page - 1;
      cursor = this.cursors.get(prevPage);
      if (cursor === undefined) {
        // Cannot jump if we don't have the previous cursor
        return;
      }
    }

    this.personService.pagedSearch(this.searchTerm(), this.pageSize(), cursor).subscribe(res => {
      this.pagesCache.set(page, res.persons);
      this.cursors.set(page, res.nextCursor);
      this._persons.set(res.persons);
      this.currentPage.set(page);
    });
  }

  next() {
    const nextPage = this.currentPage() + 1;
    void this.loadPage(nextPage);
  }

  prev() {
    const prevPage = this.currentPage() - 1;
    if (prevPage < 1) return;
    if (this.pagesCache.has(prevPage)) {
      this._persons.set(this.pagesCache.get(prevPage) || []);
      this.currentPage.set(prevPage);
    }
  }

  onSearchChange(term: string) {
    this.searchTerm.set(term);
    // Reset to page 1 when search term changes
    this.pagesCache.clear();
    this.cursors.clear();
    this.currentPage.set(0); // Temporarily set to 0 to force reload
    void this.loadPage(1);
  }
}
