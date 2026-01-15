
-- 1. Garante que a tabela base existe
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    items JSONB NOT NULL,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'Pendente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CORREÇÃO DO ERRO PGRST204 (IMPORTANTE)
-- Se a tabela já existia de testes anteriores, ela não tinha essas colunas.
-- Estes comandos forçam a adição das colunas sem apagar os dados.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS network_tag TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unit_name TEXT;

-- 3. Função de novos usuários (mantém busca correta no schema)
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 4. Habilita segurança (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 5. Limpa políticas antigas para evitar conflitos/erros
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

-- 6. Recria as Políticas de Segurança
-- Usuário vê seus próprios pedidos
CREATE POLICY "Users can view own orders" 
ON public.orders FOR SELECT 
USING (auth.uid() = user_id);

-- Usuário pode INSERIR pedidos (Essencial para o checkout funcionar)
CREATE POLICY "Users can insert orders" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Admin vê tudo
CREATE POLICY "Admins can view all orders" 
ON public.orders FOR SELECT 
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Admin atualiza status
CREATE POLICY "Admins can update orders" 
ON public.orders FOR UPDATE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- 7. Força atualização do Cache do Supabase (para reconhecer as novas colunas imediatamente)
NOTIFY pgrst, 'reload schema';
