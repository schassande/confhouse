import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreGenericService } from './firestore-generic.service';
import {
  buildDefaultPlatformConfig,
  PlatformConfig,
  PLATFORM_CONFIG_DOC_ID,
} from '../model/platform-config.model';

@Injectable({ providedIn: 'root' })
export class PlatformConfigService extends FirestoreGenericService<PlatformConfig> {
  protected override getCollectionName(): string {
    return 'platform-config';
  }

  getPlatformConfig(): Observable<PlatformConfig> {
    return this.byId(PLATFORM_CONFIG_DOC_ID).pipe(
      map((config) => {
        if (!config) {
          return buildDefaultPlatformConfig();
        }
        return {
          ...buildDefaultPlatformConfig(),
          ...config,
          id: PLATFORM_CONFIG_DOC_ID,
        };
      })
    );
  }

  savePlatformConfig(onlyPlatformAdminCanCreateConference: boolean): Observable<PlatformConfig> {
    const nextConfig: PlatformConfig = {
      ...buildDefaultPlatformConfig(),
      onlyPlatformAdminCanCreateConference,
    };
    return this.save(nextConfig);
  }
}
