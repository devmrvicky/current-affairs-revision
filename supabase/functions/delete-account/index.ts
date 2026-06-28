// supabase/functions/delete-account/index.ts
//
// Deletes the calling user's own auth account (and, via ON DELETE CASCADE on
// every table's user_id foreign key, all of their synced data).
//
// This MUST run server-side: deleting another user's auth row requires the
// service-role key, which is never safe to ship to a browser. The function
// itself verifies the caller's own JWT first — it can only ever delete the
// account that's calling it, never an arbitrary user_id passed in by a client.
//
// Deploy with: supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  // Client scoped to the CALLER's own JWT — only used to verify who's asking.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 });
  }

  const userId = userData.user.id;

  // Admin client (service role) — the only thing it's used for is deleting
  // exactly the account we just verified above.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
