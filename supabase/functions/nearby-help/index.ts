import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const latitude = parseFloat(url.searchParams.get('latitude') || '0');
    const longitude = parseFloat(url.searchParams.get('longitude') || '0');
    const radiusKm = parseFloat(url.searchParams.get('radius') || '10');
    const type = url.searchParams.get('type'); // 'need_help' or 'offer_help'
    const category = url.searchParams.get('category');

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: 'latitude and longitude are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all help posts with location data and status = 'open'
    let query = supabaseClient
      .from('help_posts')
      .select('*, profiles:user_id(full_name, phone, avatar_url)')
      .eq('status', 'open')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (type) {
      query = query.eq('type', type);
    }
    if (category) {
      query = query.eq('category', category);
    }

    const { data: posts, error } = await query;

    if (error) {
      console.error('Error fetching help posts:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter posts within radius and calculate distances
    const nearbyPosts = posts
      .map(post => {
        const distance = calculateDistance(
          latitude,
          longitude,
          parseFloat(post.latitude),
          parseFloat(post.longitude)
        );
        return { ...post, distance_km: Math.round(distance * 100) / 100 };
      })
      .filter(post => post.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    console.log(`Found ${nearbyPosts.length} help posts within ${radiusKm}km`);

    return new Response(
      JSON.stringify({ 
        data: nearbyPosts,
        count: nearbyPosts.length,
        search_params: {
          latitude,
          longitude,
          radius_km: radiusKm
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in nearby-help function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});