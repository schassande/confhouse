import { Routes } from '@angular/router';

import { HomeComponent } from './pages/home/home.component';
import { ConferenceViewComponent } from './pages/conference/conference-view/conference-view.component';
import { ConferenceConfigComponent } from './pages/conference/conference-config/conference-config.component';
import { ConferenceManage } from './pages/conference/conference-manage/conference-manage';
import { ConferenceSpeakers } from './pages/conference/conference-speakers/conference-speakers';
import { ConferenceSpeakerEdit } from './pages/conference/conference-speaker-edit/conference-speaker-edit';

import { SignupComponent } from './pages/person/signup/signup.component';
import { LoginComponent } from './pages/person/login/login.component';
import { PreferenceComponent } from './pages/preference/preference.component';
import { PersonListComponent } from './pages/person/list/person-list.component';
import { AdminGuard } from './guards/admin.guard';
import { AuthGuard } from './guards/auth.guard';
import { SessionList } from './pages/session/session-list/session-list';
import { SessionEdit } from './pages/session/session-edit/session-edit';
import { SessionImportComponent } from './pages/session/session-import/session-import.component';
import { SessionAllocation } from './pages/session/session-allocation/session-allocation';
import { SessionPublishComponent } from './pages/session/session-publish/session-publish.component';
import { VoxxrinConfigComponent } from './pages/session/session-publish/voxxrin-config/voxxrin-config.component';
import { ConferenceOrganizerGuard } from './guards/conference-organizer.guard';
import { ConferenceManageContextGuard } from './guards/conference-manage-context.guard';
import { PlatformConfigComponent } from './pages/admin/platform-config/platform-config.component';
import { ConferenceCreateGuard } from './guards/conference-create.guard';
import { ActivityConfigComponent } from './pages/activity/activity-config/activity-config.component';
import { ActivityParticipationComponent } from './pages/activity/activity-participation/activity-participation.component';
import { ActivityAdminComponent } from './pages/activity/activity-admin/activity-admin.component';

export const routes: Routes = [
	{ path: '', component: HomeComponent, pathMatch: 'full' },
	{ path: 'conference/create', component: ConferenceConfigComponent, canActivate: [AuthGuard, ConferenceCreateGuard] },
	{ path: 'conference/:conferenceId/edit', component: ConferenceConfigComponent, canActivate: [AuthGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/manage', component: ConferenceManage, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/speakers', component: ConferenceSpeakers, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/speakers/create', component: ConferenceSpeakerEdit, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard], data: { mode: 'create' } },
	{ path: 'conference/:conferenceId/speakers/:conferenceSpeakerId', component: ConferenceSpeakerEdit, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard], data: { mode: 'edit' } },
	{ path: 'conference/:conferenceId/sessions', component: SessionList, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/allocation', component: SessionAllocation, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/sessions/import', component: SessionImportComponent, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/activities', component: ActivityConfigComponent, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/activity-participation', component: ActivityParticipationComponent, canActivate: [AuthGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/activities/:activityId/participation', component: ActivityParticipationComponent, canActivate: [AuthGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/activities/:activityId/admin', component: ActivityAdminComponent, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/publish', component: SessionPublishComponent, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/publish/voxxrin-config', component: VoxxrinConfigComponent, canActivate: [AuthGuard, ConferenceOrganizerGuard, ConferenceManageContextGuard] },
	{ path: 'conference/:conferenceId/sessions/create', component: SessionEdit, canActivate: [AuthGuard, ConferenceManageContextGuard], data: { mode: 'create' } },
	{ path: 'conference/:conferenceId/sessions/:sessionId/edit', component: SessionEdit, canActivate: [AuthGuard, ConferenceManageContextGuard], data: { mode: 'edit' } },
	{ path: 'conference/:conferenceId', component: ConferenceViewComponent },
	{ path: 'preference', component: PreferenceComponent },
	{ path: 'admin/persons', component: PersonListComponent, canActivate: [AdminGuard] },
	{ path: 'admin/platform-config', component: PlatformConfigComponent, canActivate: [AdminGuard] },
	{ path: 'signup', component: SignupComponent },
	{ path: 'login', component: LoginComponent }
];
