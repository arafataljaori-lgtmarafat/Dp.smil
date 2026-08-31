const uuidSegment = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const serverOwnedStorageKey = new RegExp(
  `^users/${uuidSegment}/cases/${uuidSegment}/(?:(?:source|generated)/${uuidSegment}|ingest/${uuidSegment}/${uuidSegment})$`,
  'i',
);

export function isServerOwnedObjectStorageKey(key: string): boolean {
  return serverOwnedStorageKey.test(key);
}

function assertServerIdentifier(value: string, name: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new TypeError(`${name} must be a server-generated opaque identifier.`);
  }
  return value;
}

function userCasePrefix(ownerUserId: string, caseId: string): string {
  return `users/${assertServerIdentifier(ownerUserId, 'ownerUserId')}/cases/${assertServerIdentifier(caseId, 'caseId')}`;
}

/** Server-owned key for an immutable committed source object. */
export function sourceMediaStorageKey(ownerUserId: string, caseId: string, mediaId: string): string {
  return `${userCasePrefix(ownerUserId, caseId)}/source/${assertServerIdentifier(mediaId, 'mediaId')}`;
}

/** Server-owned key for a committed generated object. */
export function generatedMediaStorageKey(ownerUserId: string, caseId: string, mediaId: string): string {
  return `${userCasePrefix(ownerUserId, caseId)}/generated/${assertServerIdentifier(mediaId, 'mediaId')}`;
}

/** Server-owned staging key. A staging object is never a committed MediaAsset. */
export function mediaIngestStorageKey(
  ownerUserId: string,
  caseId: string,
  uploadSessionId: string,
  attemptId: string,
): string {
  return `${userCasePrefix(ownerUserId, caseId)}/ingest/${assertServerIdentifier(uploadSessionId, 'uploadSessionId')}/${assertServerIdentifier(attemptId, 'attemptId')}`;
}
