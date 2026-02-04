-- 1. LIMPEZA E PREPARAÇÃO (Executar no SQL Editor do Supabase)
-- Isso garante que não haja conflitos com versões anteriores.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ATENÇÃO: As linhas abaixo recriam as tabelas. Se já tiver dados importantes, comente-as.
-- DROP TABLE IF EXISTS public.orders CASCADE;
-- DROP TABLE IF EXISTS public.users CASCADE;

-- 2. TABELA DE USUÁRIOS (Se não existir, cria. Se existir, garante colunas)
CREATE TABLE IF NOT EXISTS public.users (
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

-- 3. TABELA DE PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
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

-- 4. FUNÇÃO E GATILHO (TRIGGER) - A MÁGICA ACONTECE AQUI
-- Isso pega os dados enviados pelo App no momento do cadastro e salva na tabela pública
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
    -- Pega do metadata enviado pelo App (options.data)
    COALESCE(new.raw_user_meta_data->>'unit_name', ''),
    COALESCE(new.raw_user_meta_data->>'network_tag', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    COALESCE(new.raw_user_meta_data->>'cnpj', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'contact_name', ''),
    COALESCE(new.raw_user_meta_data->>'cep', ''),
    COALESCE(new.raw_user_meta_data->>'address_street', ''),
    COALESCE(new.raw_user_meta_data->>'address_city', ''),
    COALESCE(new.raw_user_meta_data->>'address_state', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    unit_name = EXCLUDED.unit_name,
    network_tag = EXCLUDED.network_tag,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    address_street = EXCLUDED.address_street;
    
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ativa o gatilho
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. PERMISSÕES DE SEGURANÇA (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Limpa políticas antigas para evitar duplicação
DROP POLICY IF EXISTS "Public users are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users; -- Importante para o fallback

-- Cria novas políticas
CREATE POLICY "Public users are viewable by everyone" 
ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" 
ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE USING (auth.uid() = id);

-- Pedidos
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

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