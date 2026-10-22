import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let clientInstance: SupabaseClient | null = null;
let bucketEnsured = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (!config.isCloudPersistenceEnabled) {
    return null;
  }

  if (!clientInstance) {
    clientInstance = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return clientInstance;
}

export async function ensureStorageBucket(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || bucketEnsured) {
    return bucketEnsured;
  }

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn(`[Supabase Storage] Warning listing buckets: ${listError.message}`);
      return false;
    }

    const bucketName = config.supabaseStorageBucket;
    const exists = buckets?.some(b => b.name === bucketName);

    if (!exists) {
      console.log(`[Supabase Storage] Creating private bucket '${bucketName}'...`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false, // Strictly private to preserve zero-trust access control
        fileSizeLimit: config.maxFileSizeBytes
      });

      if (createError) {
        console.warn(`[Supabase Storage] Notice creating bucket: ${createError.message}`);
      } else {
        console.log(`[Supabase Storage] Private bucket '${bucketName}' created successfully.`);
      }
    }

    bucketEnsured = true;
    return true;
  } catch (err: any) {
    console.warn(`[Supabase Storage] Unable to verify/create bucket: ${err.message}`);
    return false;
  }
}
