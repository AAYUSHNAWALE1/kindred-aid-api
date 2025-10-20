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

    // GET - List all help posts or get specific one
    if (method === 'GET') {
      const postId = url.searchParams.get('id');
      const type = url.searchParams.get('type'); // 'need_help' or 'offer_help'
      const status = url.searchParams.get('status');
      const category = url.searchParams.get('category');

      let query = supabaseClient
        .from('help_posts')
        .select('*, profiles:user_id(full_name, avatar_url)')
        .order('created_at', { ascending: false });

      if (postId) {
        query = query.eq('id', postId);
      }
      if (type) {
        query = query.eq('type', type);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (category) {
        query = query.eq('category', category);
      }

      const result = postId ? await query.maybeSingle() : await query;

      if (result.error) {
        console.error('Error fetching help posts:', result.error);
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

    // POST - Create new help post
    if (method === 'POST') {
      const body = await req.json();
      const { type, title, description, category, latitude, longitude } = body;

      if (!type || !title || !description || !category) {
        return new Response(
          JSON.stringify({ error: 'type, title, description, and category are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseClient
        .from('help_posts')
        .insert({
          user_id: user.id,
          type,
          title,
          description,
          category,
          latitude,
          longitude,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating help post:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Help post created:', data.id);

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUT - Update help post
    if (method === 'PUT') {
      const postId = url.searchParams.get('id');
      if (!postId) {
        return new Response(
          JSON.stringify({ error: 'Post ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const updates: any = {};

      if (body.title) updates.title = body.title;
      if (body.description) updates.description = body.description;
      if (body.category) updates.category = body.category;
      if (body.status) updates.status = body.status;
      if (body.latitude !== undefined) updates.latitude = body.latitude;
      if (body.longitude !== undefined) updates.longitude = body.longitude;

      const { data, error } = await supabaseClient
        .from('help_posts')
        .update(updates)
        .eq('id', postId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating help post:', error);
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

    // DELETE - Delete help post
    if (method === 'DELETE') {
      const postId = url.searchParams.get('id');
      if (!postId) {
        return new Response(
          JSON.stringify({ error: 'Post ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabaseClient
        .from('help_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting help post:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in help-posts function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});