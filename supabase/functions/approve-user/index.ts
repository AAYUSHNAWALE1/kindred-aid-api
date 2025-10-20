import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApproveUserRequest {
  user_id: string;
  status: 'approved' | 'rejected' | 'suspended';
  role?: 'admin' | 'user';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Check if user is admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: roles, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roles) {
      console.error('Admin check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id, status, role }: ApproveUserRequest = await req.json();

    if (!user_id || !status) {
      return new Response(
        JSON.stringify({ error: 'user_id and status are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update user status
    const { data: profile, error: updateError } = await supabaseClient
      .from('profiles')
      .update({ status })
      .eq('id', user_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating user status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update user status', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If approved and role is specified, assign role
    if (status === 'approved' && role) {
      const { error: roleInsertError } = await supabaseClient
        .from('user_roles')
        .upsert({ user_id, role }, { onConflict: 'user_id,role' });

      if (roleInsertError) {
        console.error('Error assigning role:', roleInsertError);
      }
    }

    console.log(`User ${user_id} status updated to ${status}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        profile,
        message: `User ${status} successfully` 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in approve-user function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});