
-- 1. Garante que a tabela base existe
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    items JSONB NOT NULL,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'Pendente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ADIÇÃO SEGURA DE COLUNAS (Executa mesmo se a tabela já existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='network_tag') THEN
        ALTER TABLE public.orders ADD COLUMN network_tag TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='unit_name') THEN
        ALTER TABLE public.orders ADD COLUMN unit_name TEXT;
    END IF;
END $$;

-- 3. Ajuste de função trigger (segurança)
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 4. Habilita RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 5. Limpa políticas antigas
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

-- 6. Recria Políticas
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 7. IMPORTANTE: Força o Supabase a reconhecer as mudanças imediatamente
NOTIFY pgrst, 'reload schema';
