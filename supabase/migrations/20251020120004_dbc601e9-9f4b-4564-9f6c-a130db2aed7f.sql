-- Create enum types
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE public.help_post_type AS ENUM ('need_help', 'offer_help');
CREATE TYPE public.help_post_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.grievance_status AS ENUM ('submitted', 'under_review', 'resolved', 'closed');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  neighborhood_id UUID,
  bio TEXT,
  avatar_url TEXT,
  status user_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create user_roles table for admin management
CREATE TABLE public.user_roles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create neighborhoods table
CREATE TABLE public.neighborhoods (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_km DECIMAL(5, 2) NOT NULL DEFAULT 5.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create help_posts table
CREATE TABLE public.help_posts (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type help_post_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status help_post_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create ratings table
CREATE TABLE public.ratings (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  help_post_id UUID REFERENCES public.help_posts(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(rater_id, rated_user_id, help_post_id)
);

-- Create grievances table
CREATE TABLE public.grievances (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status grievance_status NOT NULL DEFAULT 'submitted',
  admin_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create support_tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority ticket_priority NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create ticket_messages table for support conversations
CREATE TABLE public.ticket_messages (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Add foreign key for neighborhood_id after neighborhoods table is created
ALTER TABLE public.profiles ADD CONSTRAINT fk_neighborhood FOREIGN KEY (neighborhood_id) REFERENCES public.neighborhoods(id);

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to check if user is approved
CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND status = 'approved'
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view approved profiles" ON public.profiles
  FOR SELECT USING (status = 'approved' OR id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for neighborhoods
CREATE POLICY "Anyone can view neighborhoods" ON public.neighborhoods
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage neighborhoods" ON public.neighborhoods
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for help_posts
CREATE POLICY "Approved users can view help posts" ON public.help_posts
  FOR SELECT USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can create help posts" ON public.help_posts
  FOR INSERT WITH CHECK (
    public.is_approved(auth.uid()) AND user_id = auth.uid()
  );

CREATE POLICY "Users can update own help posts" ON public.help_posts
  FOR UPDATE USING (user_id = auth.uid() AND public.is_approved(auth.uid()));

CREATE POLICY "Users can delete own help posts" ON public.help_posts
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for ratings
CREATE POLICY "Users can view ratings" ON public.ratings
  FOR SELECT USING (public.is_approved(auth.uid()));

CREATE POLICY "Users can create ratings" ON public.ratings
  FOR INSERT WITH CHECK (
    public.is_approved(auth.uid()) AND rater_id = auth.uid()
  );

-- RLS Policies for grievances
CREATE POLICY "Users can view own grievances" ON public.grievances
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create grievances" ON public.grievances
  FOR INSERT WITH CHECK (
    public.is_approved(auth.uid()) AND user_id = auth.uid()
  );

CREATE POLICY "Admins can view all grievances" ON public.grievances
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update grievances" ON public.grievances
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for support_tickets
CREATE POLICY "Users can view own tickets" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "Users can create tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (
    public.is_approved(auth.uid()) AND user_id = auth.uid()
  );

CREATE POLICY "Admins can view all tickets" ON public.support_tickets
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tickets" ON public.support_tickets
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for ticket_messages
CREATE POLICY "Users can view messages on their tickets" ON public.ticket_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE id = ticket_messages.ticket_id
      AND (user_id = auth.uid() OR assigned_to = auth.uid())
    )
  );

CREATE POLICY "Users can create messages on their tickets" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE id = ticket_messages.ticket_id
      AND (user_id = auth.uid() OR assigned_to = auth.uid())
    )
  );

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_neighborhoods_updated_at
  BEFORE UPDATE ON public.neighborhoods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_help_posts_updated_at
  BEFORE UPDATE ON public.help_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grievances_updated_at
  BEFORE UPDATE ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    'pending'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_neighborhood ON public.profiles(neighborhood_id);
CREATE INDEX idx_help_posts_user ON public.help_posts(user_id);
CREATE INDEX idx_help_posts_status ON public.help_posts(status);
CREATE INDEX idx_help_posts_location ON public.help_posts(latitude, longitude);
CREATE INDEX idx_ratings_rated_user ON public.ratings(rated_user_id);
CREATE INDEX idx_grievances_user ON public.grievances(user_id);
CREATE INDEX idx_grievances_status ON public.grievances(status);
CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);