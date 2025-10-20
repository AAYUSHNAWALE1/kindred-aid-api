import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const method = req.method;

    // GET - List grievances
    if (method === 'GET') {
      const grievanceId = url.searchParams.get('id');
      const status = url.searchParams.get('status');

      // Check if user is admin
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      let query = supabaseClient
        .from('grievances')
        .select('*, profiles:user_id(full_name, email)')
        .order('created_at', { ascending: false });

      if (grievanceId) {
        query = query.eq('id', grievanceId);
      }

      // Non-admins can only see their own grievances
      if (!roles) {
        query = query.eq('user_id', user.id);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const result = grievanceId ? await query.maybeSingle() : await query;

      if (result.error) {
        console.error('Error fetching grievances:', result.error);
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ data: result.data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST - Submit a grievance
    if (method === 'POST') {
      const body = await req.json();
      const { title, description, category } = body;

      if (!title || !description || !category) {
        return new Response(
          JSON.stringify({ error: 'title, description, and category are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseClient
        .from('grievances')
        .insert({
          user_id: user.id,
          title,
          description,
          category,
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting grievance:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Grievance submitted:', data.id);

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUT - Update grievance (admin only)
    if (method === 'PUT') {
      const grievanceId = url.searchParams.get('id');
      if (!grievanceId) {
        return new Response(
          JSON.stringify({ error: 'Grievance ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if user is admin
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roles) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const updates: any = {};

      if (body.status) {
        updates.status = body.status;
        if (body.status === 'resolved') {
          updates.resolved_at = new Date().toISOString();
        }
      }
      if (body.admin_notes) updates.admin_notes = body.admin_notes;

      const { data, error } = await supabaseClient
        .from('grievances')
        .update(updates)
        .eq('id', grievanceId)
        .select()
        .single();

      if (error) {
        console.error('Error updating grievance:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in grievances function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});