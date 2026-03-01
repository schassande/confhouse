import { EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collectionData, docData } from '@angular/fire/firestore';
import { from, map, Observable } from 'rxjs';
import { PersistentData } from '../model/persistant.model';
import {
  collection,
  CollectionReference,
  deleteDoc,
  doc,
  DocumentData,
  getDocs,
  limit,
  query,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

/**
 * Generic service for Firestore persistent documents.
 * Provides basic CRUD operations for any document type extending PersistentData.
 */
export abstract class FirestoreGenericService<T extends PersistentData> {
  protected firestore = inject(Firestore)
  private readonly injector = inject(EnvironmentInjector);

  protected abstract getCollectionName(): string;

  protected adjustItemOnLoad(item: T): T { return item;}

  protected itemsCollection(): CollectionReference<DocumentData,DocumentData> {
    return collection(this.firestore, this.getCollectionName());
  }
  public all(): Observable<T[]> {
    return runInInjectionContext(
      this.injector,
      () => collectionData(this.itemsCollection(), { idField: 'id' }) as Observable<T[]>
    );
  }

  public byId(id: string): Observable<T | undefined> {
    const path = `${this.getCollectionName()}/${id}`;
    const itemDoc = doc(this.firestore, path);
    return runInInjectionContext(
      this.injector,
      () => docData(itemDoc, { idField: 'id' }) as Observable<T | undefined>
    );
  }
  public save(item: T): Observable<T> {
    if (item.id) {
      // console.log(`Updating ${this.getCollectionName()}:${item.id}...`);
      return this.update(item);
    } else {
      // console.log(`Creating ${this.getCollectionName()}:${item.id}...`);
      return this.create(item);
    }
  }

  private create(item: T): Observable<T> {
    // Génère un ID unique
    item.id = doc(this.itemsCollection()).id;
    // console.log(`Creating new item with ID: ${item.id}`);
    item.lastUpdated = new Date().getTime().toString();
    const itemDoc = doc(this.firestore, `${this.getCollectionName()}/${item.id}`);
    // console.log(`Document ID: ${itemDoc.id}`);
    const sanitized = this.removeUndefinedDeep(item) as T;
    return from(setDoc(itemDoc, sanitized).then(() => sanitized));
  }

  private update(item: T): Observable<T> {
    item.lastUpdated = new Date().getTime().toString();
    const itemDoc = doc(this.firestore, `${this.getCollectionName()}/${item.id}`);
    const sanitized = this.removeUndefinedDeep(item) as T;
    return from(setDoc(itemDoc, sanitized).then(() => sanitized));
  }

  public delete(id: string): Promise<void> {
    const itemDoc = doc(this.firestore, `${this.getCollectionName()}/${id}`);
    return deleteDoc(itemDoc);
  }
  public deleteAll(): Observable<void> {
    return from(
      (async () => {
        const snapshot = await getDocs(this.itemsCollection());
        const batchSize = 500;

        for (let i = 0; i < snapshot.docs.length; i += batchSize) {
          const batch = writeBatch(this.firestore);
          snapshot.docs.slice(i, i + batchSize).forEach((itemDoc) => {
            batch.delete(itemDoc.ref);
          });
          await batch.commit();
        }
      })()
    );
  }
  public queryOne(q: Query): Observable<T|null> {
    return from(getDocs(query(q, limit(1))) as Promise<QuerySnapshot<T>>).pipe(
      map(this.snapshotOneToObs.bind(this))
    );
  }

  public query(q: Query): Observable<T[]> {
    return from(getDocs(query(q)) as Promise<QuerySnapshot<T>>).pipe(
      map(this.snapshotToObs.bind(this))
    );
  }
  private snapshotOneToObs(qs: QuerySnapshot<T>): T|null {
    const datas: T[] = [];
    qs.forEach((qds: QueryDocumentSnapshot<T>) => {
        const data: T = qds.data();
        if (data) {
            // store id inside persistent object
            data.id = qds.id;
            this.adjustItemOnLoad(data);
        }
        datas.push(data);
    });
    if (datas.length > 0) {
        return datas[0];
    } else {
        return null;
    }
  }
  private snapshotToObs(qs: QuerySnapshot<T>): T[] {
    const datas: T[] = [];
    qs.forEach((qds: QueryDocumentSnapshot<T>) => {
      const data: T = qds.data();
      if (data) {
          // store id inside persistent object
          data.id = qds.id;
          this.adjustItemOnLoad(data);
      }
      datas.push(data);
    });
    return datas;
  }
  public filter(obs: Observable<T[]>, filter: PersistentDataFilter<T>) {
    return obs.pipe(
        map((result: T[]) => result.filter( (elem: T) => filter(elem)))
    );
  }
  public stringContains(elem: string, text: string): boolean {
    return elem !== undefined && text !== undefined && text.toLowerCase().indexOf(elem.toLowerCase()) >= 0;
  }

  private removeUndefinedDeep(value: unknown): unknown {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this.removeUndefinedDeep(item))
        .filter((item) => item !== undefined);
    }
    if (typeof value === 'object') {
      const sanitizedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, entryValue]) => [key, this.removeUndefinedDeep(entryValue)] as const)
        .filter(([, entryValue]) => entryValue !== undefined);
      return Object.fromEntries(sanitizedEntries);
    }
    return value;
  }
}
export interface PersistentDataFilter<T extends PersistentData> {
  (data: T): boolean;
}
