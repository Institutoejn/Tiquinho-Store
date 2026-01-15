
-- 1. Cria a tabela de pedidos se não existir
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    unit_name TEXT NOT NULL,
    network_tag TEXT NOT NULL,
    items JSONB NOT NULL,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'Pendente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Correção do Alerta "Function Search Path Mutable"
-- Força a função de novos usuários a olhar apenas para o esquema public
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 3. Habilita segurança (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 4. Limpeza de políticas antigas
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

-- 5. Políticas de Segurança Corrigidas (Remove o alerta "RLS Policy Always True")

-- Cliente: Vê apenas os seus pedidos
CREATE POLICY "Users can view own orders" 
ON public.orders FOR SELECT 
USING (auth.uid() = user_id);

-- Cliente: Pode INSERIR pedidos (correção do erro de checkout)
CREATE POLICY "Users can insert orders" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Admin: Vê TODOS os pedidos (Correção de segurança: verifica se é admin de fato)
CREATE POLICY "Admins can view all orders" 
ON public.orders FOR SELECT 
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Admin: Pode ATUALIZAR status (Correção de segurança: verifica se é admin de fato)
CREATE POLICY "Admins can update orders" 
ON public.orders FOR UPDATE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
