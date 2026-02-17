import { PersistentData } from './persistant.model';

export interface ConferenceSecret extends PersistentData {
  conferenceId: string;
  secretName: string;
  secretValue: string;
}
