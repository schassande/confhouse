import { PersistentData } from './persistant.model';

export const PLATFORM_CONFIG_DOC_ID = 'PlatformConfig';

export interface PlatformConfig extends PersistentData {
  onlyPlatformAdminCanCreateConference: boolean;
  singleConferenceId: string;
}

export function buildDefaultPlatformConfig(): PlatformConfig {
  return {
    id: PLATFORM_CONFIG_DOC_ID,
    lastUpdated: '0',
    onlyPlatformAdminCanCreateConference: false,
    singleConferenceId: '',
  };
}
