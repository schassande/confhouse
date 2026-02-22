import { Routes } from '@angular/router';

import { AdminGuard } from './guards/admin.guard';
import { AuthGuard } from './guards/auth.guard';
import { ConferenceOrganizerGuard } from './guards/conference-organizer.guard';
import { ConferenceManageContextGuard } from './guards/conference-manage-context.guard';
import { ConferenceCreateGuard } from './guards/conference-create.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent), pathMatch: 'full' },
  {
    path: 'conference/create',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceCreateGuard],
    data: { section: 'general' },
  },
  {
    path: 'conference/:conferenceId/edit',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { section: 'general' },
  },
  {
    path: 'conference/:conferenceId/config/general',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { section: 'general' },
  },
  {
    path: 'conference/:conferenceId/config/session-types',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { section: 'session-types' },
  },
  {
    path: 'conference/:conferenceId/config/tracks',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { section: 'tracks' },
  },
  {
    path: 'conference/:conferenceId/config/rooms',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { section: 'rooms' },
  },
  {
    path: 'conference/:conferenceId/config/planning-structure',
    loadComponent: () => import('./pages/conference/conference-config/conference-config.component').then((m) => m.ConferenceConfigComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { section: 'planning-structure' },
  },
  {
    path: 'conference/:conferenceId/manage',
    loadComponent: () => import('./pages/conference/conference-manage/conference-manage').then((m) => m.ConferenceManage),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/speakers',
    loadComponent: () => import('./pages/conference/conference-speakers/conference-speakers').then((m) => m.ConferenceSpeakers),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/speakers/create',
    loadComponent: () => import('./pages/conference/conference-speaker-edit/conference-speaker-edit').then((m) => m.ConferenceSpeakerEdit),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
    data: { mode: 'create' },
  },
  {
    path: 'conference/:conferenceId/speakers/:conferenceSpeakerId',
    loadComponent: () => import('./pages/conference/conference-speaker-edit/conference-speaker-edit').then((m) => m.ConferenceSpeakerEdit),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
    data: { mode: 'edit' },
  },
  {
    path: 'conference/:conferenceId/sessions',
    loadComponent: () => import('./pages/session/session-list/session-list').then((m) => m.SessionList),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/allocation',
    loadComponent: () => import('./pages/session/session-allocation/session-allocation').then((m) => m.SessionAllocation),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/sessions/import',
    loadComponent: () => import('./pages/session/session-import/session-import.component').then((m) => m.SessionImportComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/activities',
    loadComponent: () => import('./pages/activity/activity-config/activity-config.component').then((m) => m.ActivityConfigComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/sponsors/config',
    loadComponent: () => import('./pages/sponsor/sponsor-config/sponsor-config.component').then((m) => m.SponsorConfigComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/sponsors/manage',
    loadComponent: () => import('./pages/sponsor/sponsor-manage/sponsor-manage.component').then((m) => m.SponsorManageComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/activity-participation',
    loadComponent: () => import('./pages/activity/activity-participation/activity-participation.component').then((m) => m.ActivityParticipationComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/activities/:activityId/participation',
    loadComponent: () => import('./pages/activity/activity-participation/activity-participation.component').then((m) => m.ActivityParticipationComponent),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/activities/:activityId/admin',
    loadComponent: () => import('./pages/activity/activity-admin/activity-admin.component').then((m) => m.ActivityAdminComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/publish',
    loadComponent: () => import('./pages/session/session-publish/session-publish.component').then((m) => m.SessionPublishComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/publish/voxxrin-config',
    loadComponent: () => import('./pages/session/session-publish/voxxrin-config/voxxrin-config.component').then((m) => m.VoxxrinConfigComponent),
    canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard],
  },
  {
    path: 'conference/:conferenceId/sessions/create',
    loadComponent: () => import('./pages/session/session-edit/session-edit').then((m) => m.SessionEdit),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { mode: 'create' },
  },
  {
    path: 'conference/:conferenceId/sessions/:sessionId/edit',
    loadComponent: () => import('./pages/session/session-edit/session-edit').then((m) => m.SessionEdit),
    canActivate: [AuthGuard, ConferenceManageContextGuard],
    data: { mode: 'edit' },
  },
  { path: 'conference/:conferenceId', loadComponent: () => import('./pages/conference/conference-view/conference-view.component').then((m) => m.ConferenceViewComponent) },
  { path: 'preference', loadComponent: () => import('./pages/preference/preference.component').then((m) => m.PreferenceComponent) },
  {
    path: 'admin/persons',
    loadComponent: () => import('./pages/person/list/person-list.component').then((m) => m.PersonListComponent),
    canActivate: [AdminGuard],
  },
  {
    path: 'admin/platform-config',
    loadComponent: () => import('./pages/admin/platform-config/platform-config.component').then((m) => m.PlatformConfigComponent),
    canActivate: [AdminGuard],
  },
  { path: 'signup', loadComponent: () => import('./pages/person/signup/signup.component').then((m) => m.SignupComponent) },
  { path: 'login', loadComponent: () => import('./pages/person/login/login.component').then((m) => m.LoginComponent) },
];
