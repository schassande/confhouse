import { Routes } from '@angular/router';

import { HomeComponent } from './pages/home/home.component';
import { ConferenceViewComponent } from './pages/conference/conference-view/conference-view.component';
import { ConferenceConfigComponent } from './pages/conference/conference-config/conference-config.component';
import { ConferenceManage } from './pages/conference/conference-manage/conference-manage';
import { ConferenceSpeakers } from './pages/conference/conference-speakers/conference-speakers';

import { SignupComponent } from './pages/person/signup/signup.component';
import { LoginComponent } from './pages/person/login/login.component';
import { PreferenceComponent } from './pages/preference/preference.component';
import { PersonListComponent } from './pages/person/list/person-list.component';
import { AdminGuard } from './guards/admin.guard';
import { AuthGuard } from './guards/auth.guard';
import { SessionList } from './pages/session/session-list/session-list';
import { SessionEdit } from './pages/session/session-edit/session-edit';
import { SessionImportComponent } from './pages/session/session-import/session-import.component';
import { ConferenceOrganizerGuard } from './guards/conference-organizer.guard';

export const routes: Routes = [
	{ path: '', component: HomeComponent, pathMatch: 'full' },
	{ path: 'conference/create', component: ConferenceConfigComponent, canActivate: [AuthGuard] },
	{ path: 'conference/:conferenceId/edit', component: ConferenceConfigComponent, canActivate: [AuthGuard] },
	{ path: 'conference/:conferenceId/manage', component: ConferenceManage, canActivate: [AuthGuard, ConferenceOrganizerGuard] },
	{ path: 'conference/:conferenceId/speakers', component: ConferenceSpeakers, canActivate: [AuthGuard, ConferenceOrganizerGuard] },
	{ path: 'conference/:conferenceId/sessions', component: SessionList, canActivate: [AuthGuard, ConferenceOrganizerGuard] },
	{ path: 'conference/:conferenceId/sessions/import', component: SessionImportComponent, canActivate: [AuthGuard, ConferenceOrganizerGuard] },
	{ path: 'conference/:conferenceId/sessions/:sessionId/edit', component: SessionEdit, canActivate: [AuthGuard] },
	{ path: 'conference/:conferenceId', component: ConferenceViewComponent },
	{ path: 'preference', component: PreferenceComponent },
	{ path: 'admin/persons', component: PersonListComponent, canActivate: [AdminGuard] },
	{ path: 'signup', component: SignupComponent },
	{ path: 'login', component: LoginComponent }
];
