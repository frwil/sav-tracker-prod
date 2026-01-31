import localforage from 'localforage';

// 1. Stockage pour le Cache React Query (Lecture hors ligne : Clients, Visites...)
export const queryStorage = localforage.createInstance({
  name: 'SAV_TRACKER_DB',
  storeName: 'query_cache',
  driver: localforage.INDEXEDDB // Force IndexedDB
});

// 2. Stockage pour la File d'attente de Synchro (Écriture hors ligne)
export const syncQueueStorage = localforage.createInstance({
  name: 'SAV_TRACKER_DB',
  storeName: 'sync_queue',
  driver: localforage.INDEXEDDB
});