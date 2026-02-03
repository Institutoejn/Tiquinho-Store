-- 1. LIMPEZA DE DEPENDÊNCIAS (CRUCIAL PARA CORRIGIR O ERRO 2BP01)
-- Removemos as políticas da tabela 'orders' que dependem da tabela antiga 'profiles'
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;

-- 2. REMOVER TABELA PROFILES ANTIGA
-- Usamos CASCADE para garantir que qualquer objeto dependente remanescente também seja removido
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 3. GARANTIR TABELA ORDERS (Se não existir)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

-- 4. CRIAR A TABELA 'USERS' PÚBLICA (SUBSTITUINDO PROFILES)
CREATE TABLE IF NOT EXISTS public.users (
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

-- 5. ATIVAR RLS (SEGURANÇA)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS DA TABELA USERS (PERFIL)
-- Permite que o sistema leia os usuários para verificar login/admin
CREATE POLICY "Public users are viewable by everyone" 
ON public.users FOR SELECT USING (true);

-- Permite que o usuário crie seu próprio perfil no cadastro
CREATE POLICY "Users can insert their own profile" 
ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Permite que o usuário edite seus dados
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE USING (auth.uid() = id);

-- Permite deletar conta
CREATE POLICY "Users can delete own profile" 
ON public.users FOR DELETE USING (auth.uid() = id);

-- 7. POLÍTICAS DA TABELA ORDERS (AGORA APONTANDO CORRETAMENTE PARA 'public.users')

-- Usuário comum vê e cria apenas seus pedidos
CREATE POLICY "Users can view own orders" 
ON public.orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert orders" 
ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin vê TUDO (A mágica acontece aqui: checamos se o usuário atual tem role='admin' na tabela users)
CREATE POLICY "Admins can view all orders" 
ON public.orders FOR SELECT USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- Admin edita TUDO (para mudar status dos pedidos)
CREATE POLICY "Admins can update orders" 
ON public.orders FOR UPDATE USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- 8. RECARREGAR SCHEMA DO SUPABASE
NOTIFY pgrst, 'reload schema';