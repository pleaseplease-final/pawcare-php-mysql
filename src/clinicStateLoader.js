import { clinicRequest } from './clinicApi.js';

// Kept only for this authenticated sync session, never in persistent storage or
// shared across users. A 304 reuses the last complete, authorized response.
export function createClinicStateLoader(request = clinicRequest) {
  let snapshot, etag;
  return async signal => {
    const result = await request('GET', '/api/state/summary', undefined, {signal, ifNoneMatch: etag, responseMetadata: true});
    if (result.notModified) {
      if (!snapshot) throw new Error('Clinic records could not be confirmed. Please retry.');
      return snapshot;
    }
    snapshot = result.data;
    etag = result.etag;
    return snapshot;
  };
}
