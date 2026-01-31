export interface SyncTask {
  id: string; // Un identifiant unique (uuid ou timestamp)
  url: string; // L'endpoint API (ex: /visits)
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: any; // Les données du formulaire
  timestamp: number;
  retryCount: number;
}