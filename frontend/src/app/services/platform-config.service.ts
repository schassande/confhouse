import { Injectable, Signal } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreGenericService } from './firestore-generic.service';
import {
  buildDefaultPlatformConfig,
  PlatformConfig,
  PLATFORM_CONFIG_DOC_ID,
} from '@shared/model/platform-config.model';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class PlatformConfigService extends FirestoreGenericService<PlatformConfig> {
  private readonly singleConferenceModeSignal = toSignal(
    this.getPlatformConfig().pipe(
      map((config) => config &&
          config.onlyPlatformAdminCanCreateConference &&
          config.singleConferenceId.trim().length > 0)
    ),
    { initialValue: false }
  );

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

  savePlatformConfig(
    onlyPlatformAdminCanCreateConference: boolean,
    singleConferenceId: string
  ): Observable<PlatformConfig> {
    const nextConfig: PlatformConfig = {
      ...buildDefaultPlatformConfig(),
      onlyPlatformAdminCanCreateConference,
      singleConferenceId: onlyPlatformAdminCanCreateConference ? String(singleConferenceId ?? '').trim() : '',
    };
    return this.save(nextConfig);
  }

  isSingleConferenceMode(): Signal<boolean> {
    return this.singleConferenceModeSignal;
  }
}

