export interface WithId {
    id: string;
}
export interface PersistentData extends WithId{
    /** Timestamp of the last update */
    lastUpdated: string;
}