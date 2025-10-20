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

    // GET - Get ratings for a user
    if (method === 'GET') {
      const userId = url.searchParams.get('user_id');
      
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'user_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get all ratings for the user
      const { data: ratings, error: ratingsError } = await supabaseClient
        .from('ratings')
        .select('*, rater:rater_id(full_name, avatar_url), help_posts(title)')
        .eq('rated_user_id', userId)
        .order('created_at', { ascending: false });

      if (ratingsError) {
        console.error('Error fetching ratings:', ratingsError);
        return new Response(
          JSON.stringify({ error: ratingsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate average rating
      const averageRating = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        : 0;

      return new Response(
        JSON.stringify({ 
          data: ratings,
          average_rating: Math.round(averageRating * 10) / 10,
          total_ratings: ratings.length
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST - Submit a rating
    if (method === 'POST') {
      const body = await req.json();
      const { rated_user_id, help_post_id, rating, comment } = body;

      if (!rated_user_id || !rating) {
        return new Response(
          JSON.stringify({ error: 'rated_user_id and rating are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rating < 1 || rating > 5) {
        return new Response(
          JSON.stringify({ error: 'Rating must be between 1 and 5' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rated_user_id === user.id) {
        return new Response(
          JSON.stringify({ error: 'Cannot rate yourself' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseClient
        .from('ratings')
        .insert({
          rater_id: user.id,
          rated_user_id,
          help_post_id,
          rating,
          comment,
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting rating:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Rating submitted:', data.id);

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ratings function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});