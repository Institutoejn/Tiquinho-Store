-- 1. LIMPEZA TOTAL (RESET FORCE)
-- Remove gatilhos e funções antigas
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Remove tabelas explicitamente para evitar erro "relation already exists"
-- A ordem importa: removemos quem depende (orders) antes de quem é dependido (users)
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE; 

-- 2. CRIAR A TABELA 'USERS'
CREATE TABLE public.users (
  id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email text,
  unit_name text,
  network_tag text,
  role text CHECK (role IN ('user', 'admin')) DEFAULT 'user',
  cnpj text,
  phone text,
  contact_name text,
  cep text,
  address_street text,
  address_city text,
  address_state text,
  created_at timestamptz DEFAULT now()
);

-- 3. CRIAR A TABELA 'ORDERS'
CREATE TABLE public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    items JSONB NOT NULL,
    status TEXT DEFAULT 'Pendente',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    total_price NUMERIC,
    user_email TEXT,
    payment_method TEXT DEFAULT 'PIX',
    validated_by UUID REFERENCES auth.users(id),
    validated_at TIMESTAMPTZ,
    unit_name TEXT,
    network_tag TEXT
);

-- 4. TRIGGER (GATILHO) AUTOMÁTICO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id, 
    email, 
    unit_name, 
    network_tag, 
    role, 
    cnpj, 
    phone, 
    contact_name, 
    cep, 
    address_street, 
    address_city, 
    address_state
  )
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'unit_name',
    new.raw_user_meta_data->>'network_tag',
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    new.raw_user_meta_data->>'cnpj',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'contact_name',
    new.raw_user_meta_data->>'cep',
    new.raw_user_meta_data->>'address_street',
    new.raw_user_meta_data->>'address_city',
    new.raw_user_meta_data->>'address_state'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ativa o gatilho
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. ATIVAR SEGURANÇA (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS DE ACESSO (PERMISSÕES)

-- USERS
CREATE POLICY "Public users are viewable by everyone" 
ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile" 
ON public.users FOR DELETE USING (auth.uid() = id);

-- ORDERS
CREATE POLICY "Users can view own orders" 
ON public.orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert orders" 
ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders" 
ON public.orders FOR SELECT USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Admins can update orders" 
ON public.orders FOR UPDATE USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- Recarrega o schema
NOTIFY pgrst, 'reload schema';