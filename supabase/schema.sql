-- Enable Row Level Security
alter default privileges revoke execute on functions from public;

-- Create tables for machine management
CREATE TABLE IF NOT EXISTS public.machines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id varchar(50) UNIQUE NOT NULL,
    name varchar(255) NOT NULL,
    location varchar(255),
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create table for DEX data logs
CREATE TABLE IF NOT EXISTS public.dex_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id uuid REFERENCES public.machines(id) ON DELETE CASCADE,
    raw_data text NOT NULL,
    data_size integer,
    status varchar(50) DEFAULT 'success',
    error_message text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create table for machine settings
CREATE TABLE IF NOT EXISTS public.machine_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id uuid REFERENCES public.machines(id) ON DELETE CASCADE,
    setting_key varchar(100) NOT NULL,
    setting_value text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    UNIQUE(machine_id, setting_key)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_machines_user_id ON public.machines(user_id);
CREATE INDEX IF NOT EXISTS idx_machines_machine_id ON public.machines(machine_id);
CREATE INDEX IF NOT EXISTS idx_dex_logs_machine_id ON public.dex_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_dex_logs_created_at ON public.dex_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_machine_settings_machine_id ON public.machine_settings(machine_id);

-- Enable Row Level Security
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dex_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own machines" ON public.machines
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own machines" ON public.machines
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own machines" ON public.machines
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own machines" ON public.machines
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own DEX logs" ON public.dex_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own DEX logs" ON public.dex_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own machine settings" ON public.machine_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own machine settings" ON public.machine_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own machine settings" ON public.machine_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON public.machines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_machine_settings_updated_at BEFORE UPDATE ON public.machine_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();