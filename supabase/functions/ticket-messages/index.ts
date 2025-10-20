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

    const method = req.method;

    // POST - Add message to ticket
    if (method === 'POST') {
      const body = await req.json();
      const { ticket_id, message, is_internal } = body;

      if (!ticket_id || !message) {
        return new Response(
          JSON.stringify({ error: 'ticket_id and message are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify user has access to this ticket
      const { data: ticket, error: ticketError } = await supabaseClient
        .from('support_tickets')
        .select('user_id, assigned_to')
        .eq('id', ticket_id)
        .single();

      if (ticketError || !ticket) {
        return new Response(
          JSON.stringify({ error: 'Ticket not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if user has access
      if (ticket.user_id !== user.id && ticket.assigned_to !== user.id) {
        // Check if user is admin
        const { data: roles } = await supabaseClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!roles) {
          return new Response(
            JSON.stringify({ error: 'Access denied' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data, error } = await supabaseClient
        .from('ticket_messages')
        .insert({
          ticket_id,
          user_id: user.id,
          message,
          is_internal: is_internal || false,
        })
        .select('*, user:user_id(full_name, avatar_url)')
        .single();

      if (error) {
        console.error('Error creating message:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update ticket status to 'in_progress' if it was 'open'
      await supabaseClient
        .from('support_tickets')
        .update({ status: 'in_progress' })
        .eq('id', ticket_id)
        .eq('status', 'open');

      console.log('Ticket message created:', data.id);

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
    console.error('Error in ticket-messages function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});