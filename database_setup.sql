
-- --- INSTRUÇÕES CRÍTICAS ---
-- 1. Acesse o Painel do Supabase (https://supabase.com/dashboard)
-- 2. Vá em "SQL Editor" no menu lateral.
-- 3. Cole TODO este código e clique em "RUN".

-- 1. Garantir que a tabela de perfis tenha as colunas novas (caso não tenha rodado o anterior)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS contact_name text,
ADD COLUMN IF NOT EXISTS address text;

-- 2. CRIAR A TABELA DE PEDIDOS (ORDERS)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    unit_name TEXT NOT NULL,
    network_tag TEXT NOT NULL,
    items JSONB NOT NULL, -- Armazena o array do carrinho como JSON
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'Aguardando Validação',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HABILITAR ROW LEVEL SECURITY (SEGURANÇA)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE ACESSO (RLS)

-- Política A: Usuários podem ver seus próprios pedidos
CREATE POLICY "Users can view own orders" 
ON public.orders FOR SELECT 
USING (auth.uid() = user_id);

-- Política B: Admins podem ver TODOS os pedidos
-- Assumindo que o admin tem role = 'admin' na tabela profiles ou metadata
CREATE POLICY "Admins can view all orders" 
ON public.orders FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Política C: Usuários podem criar pedidos (INSERT)
CREATE POLICY "Users can insert orders" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Política D: Admins podem atualizar status dos pedidos
CREATE POLICY "Admins can update orders" 
ON public.orders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
