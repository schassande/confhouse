import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-conference-manage',
  imports: [CommonModule, RouterModule],
  templateUrl: './conference-manage.html',
  styleUrl: './conference-manage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConferenceManage {
  private readonly route = inject(ActivatedRoute);

  conferenceId = computed(() => this.route.snapshot.paramMap.get('conferenceId') ?? '');
}
