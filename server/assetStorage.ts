import { Storage, type Bucket } from "@google-cloud/storage";

let _storage: Storage | null = null;

function getStorage(): Storage | null {
  if (_storage) return _storage;
  const projectId = process.env.GCS_PROJECT_ID;
  const clientEmail = process.env.GCS_CLIENT_EMAIL;
  const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  _storage = new Storage({
    projectId,
    credentials: { client_email: clientEmail, private_key: privateKey },
  });
  return _storage;
}

export function getBucket(): Bucket | null {
  const storage = getStorage();
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!storage || !bucketName) return null;
  return storage.bucket(bucketName);
}

export function getPublicUrl(filename: string): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  return `https://storage.googleapis.com/${bucketName}/attached_assets/${encodeURIComponent(filename)}`;
}

export async function uploadAsset(
  filePath: string,
  destFilename: string,
  contentType?: string,
): Promise<string> {
  const bucket = getBucket();
  if (!bucket) throw new Error("Asset storage not configured (missing GCS_* env vars)");
  const destination = `attached_assets/${destFilename}`;
  await bucket.upload(filePath, {
    destination,
    metadata: contentType ? { contentType } : undefined,
  });
  return `/attached_assets/${destFilename}`;
}

export function isConfigured(): boolean {
  return !!(
    process.env.GCS_BUCKET_NAME &&
    process.env.GCS_PROJECT_ID &&
    process.env.GCS_CLIENT_EMAIL &&
    process.env.GCS_PRIVATE_KEY
  );
}
