-- 1. Garante que a tabela orders existe
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    items JSONB NOT NULL,
    status TEXT DEFAULT 'Pendente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AJUSTE DE COLUNAS (Renomeação e Criação)
DO $$
BEGIN
    -- Renomeia total_amount para total_price se necessário (compatibilidade com novo código)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_amount') THEN
        ALTER TABLE public.orders RENAME COLUMN total_amount TO total_price;
    ELSE
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_price NUMERIC;
    END IF;

    -- Adiciona colunas faltantes para o fluxo de PIX e Validação
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_email TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'PIX';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id);
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
    
    -- Garante que unit_name e network_tag existam (essenciais para filtros)
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unit_name TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS network_tag TEXT;
END $$;

-- 3. CRIAR TABELA PROFILES (Essencial para cadastro de usuários)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  unit_name text,
  network_tag text,
  role text check (role in ('user', 'admin')) default 'user',
  cnpj text,
  phone text,
  contact_name text,
  cep text,
  address_street text,
  address_city text,
  address_state text,
  created_at timestamptz default now()
);

-- 4. ATIVAR RLS E POLÍTICAS DE SEGURANÇA
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas para evitar duplicidade
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

-- Políticas para Orders
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Políticas para Profiles (Corrige o erro de cadastro)
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING ((select role from public.profiles where id = auth.uid()) = 'admin');

-- 5. Recarrega Schema
NOTIFY pgrst, 'reload schema';