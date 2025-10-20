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

    // GET - List support tickets or get specific one
    if (method === 'GET') {
      const ticketId = url.searchParams.get('id');
      const includeMessages = url.searchParams.get('include_messages') === 'true';

      // Check if user is admin
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      let query = supabaseClient
        .from('support_tickets')
        .select('*, user:user_id(full_name, email), assigned:assigned_to(full_name)')
        .order('created_at', { ascending: false });

      if (ticketId) {
        query = query.eq('id', ticketId);
      }

      // Non-admins can only see their own tickets
      if (!roles) {
        query = query.eq('user_id', user.id);
      }

      const result = ticketId ? await query.maybeSingle() : await query;

      if (result.error) {
        console.error('Error fetching tickets:', result.error);
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If single ticket and messages requested, fetch messages
      if (ticketId && includeMessages && result.data && !Array.isArray(result.data)) {
        const { data: messages, error: messagesError } = await supabaseClient
          .from('ticket_messages')
          .select('*, user:user_id(full_name, avatar_url)')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });

        if (!messagesError && messages) {
          return new Response(
            JSON.stringify({ 
              data: { ...result.data, messages }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ data: result.data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST - Create support ticket
    if (method === 'POST') {
      const body = await req.json();
      const { subject, message, priority } = body;

      if (!subject || !message) {
        return new Response(
          JSON.stringify({ error: 'subject and message are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: ticket, error } = await supabaseClient
        .from('support_tickets')
        .insert({
          user_id: user.id,
          subject,
          message,
          priority: priority || 'medium',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating ticket:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create initial message
      await supabaseClient
        .from('ticket_messages')
        .insert({
          ticket_id: ticket.id,
          user_id: user.id,
          message,
        });

      console.log('Support ticket created:', ticket.id);

      return new Response(
        JSON.stringify({ data: ticket }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUT - Update ticket (admin only for status/assignment)
    if (method === 'PUT') {
      const ticketId = url.searchParams.get('id');
      if (!ticketId) {
        return new Response(
          JSON.stringify({ error: 'Ticket ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();

      // Check if user is admin for status/assignment changes
      if (body.status || body.assigned_to) {
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
      }

      const updates: any = {};
      if (body.status) {
        updates.status = body.status;
        if (body.status === 'resolved' || body.status === 'closed') {
          updates.resolved_at = new Date().toISOString();
        }
      }
      if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
      if (body.priority) updates.priority = body.priority;

      const { data, error } = await supabaseClient
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('Error updating ticket:', error);
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
    console.error('Error in support-tickets function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});