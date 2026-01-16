
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

-- 3. Trigger e Função para novos usuários (Manutenção)
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 4. RLS e Políticas de Segurança
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Política de Admin ajustada para permitir UPDATE em todas as colunas necessárias
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 5. Recarrega Schema
NOTIFY pgrst, 'reload schema';
