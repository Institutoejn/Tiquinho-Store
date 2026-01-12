
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, Hourglass, Loader2, 
  UserPlus, LogIn, ShieldCheck, TrendingUp, DollarSign, Package, PlusCircle, 
  Trash2, Image as ImageIcon, MessageCircle, QrCode, Bell, LayoutGrid, List,
  Minus, Copy, History, ChevronRight, Calendar, Truck, MapPin, Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, CartItem, Size, User as UserType } from './types';
import { supabase } from './supabaseClient';

// --- PIX HELPER FUNCTIONS ---
class PixPayload {
  private merchantKey: string;
  private merchantName: string;
  private merchantCity: string;
  private amount: string;
  private txId: string;

  constructor(key: string, name: string, city: string, amount: number, txId: string = '***') {
    this.merchantKey = key;
    this.merchantName = name;
    this.merchantCity = city;
    this.amount = amount.toFixed(2);
    this.txId = txId;
  }

  private formatField(id: string, value: string): string {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  }

  private getCRC16(payload: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
        else crc = crc << 1;
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  public generate(): string {
    const payload = [
      this.formatField('00', '01'), // Payload Format Indicator
      this.formatField('26', // Merchant Account Information
        this.formatField('00', 'br.gov.bcb.pix') +
        this.formatField('01', this.merchantKey)
      ),
      this.formatField('52', '0000'), // Merchant Category Code
      this.formatField('53', '986'),  // Transaction Currency (BRL)
      this.formatField('54', this.amount), // Transaction Amount
      this.formatField('58', 'BR'),   // Country Code
      this.formatField('59', this.merchantName), // Merchant Name
      this.formatField('60', this.merchantCity), // Merchant City
      this.formatField('62', this.formatField('05', this.txId)), // Additional Data Field Template
      '6304' // CRC16 ID + Length
    ].join('');

    return `${payload}${this.getCRC16(payload)}`;
  }
}

// --- INTERFACES LOCAIS ---
interface OrderDB {
  id: string;
  user_id: string;
  unit_name: string;
  network_tag: string;
  items: CartItem[];
  total_amount: number;
  status: string;
  created_at: string;
}

// --- UI COMPONENTS ---
const Logo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} bg-[#E11D48] rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/30 select-none border border-white/10`}>
    <span className="text-2xl font-black text-white italic tracking-tighter -skew-x-6">T</span>
  </div>
);

const Spinner = () => (
  <div className="fixed inset-0 z-[300] bg-[#09090b] flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-[#E11D48]/20 border-t-[#E11D48] rounded-full animate-spin"></div>
    </div>
    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Sincronizando</p>
  </div>
);

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl glass border-white/10 ${type === 'success' ? 'text-white' : 'bg-rose-600 text-white'}`}>
      {type === 'success' ? <CheckCircle2 size={20} className="text-rose-500" /> : <AlertCircle size={20} />}
      <span className="font-semibold text-sm">{message}</span>
    </motion.div>
  );
};

export default function App() {
  // Auth & User State
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authFlow, setAuthFlow] = useState<'initial' | 'admin' | 'client'>('initial');
  const [formData, setFormData] = useState({ 
    email: '', password: '', unit_name: '', network_tag: 'drogaria-total', role: 'user' as 'user' | 'admin', adminKey: '' 
  });

  // App State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  // Client Selection State (Para guardar o tamanho selecionado de cada produto antes de adicionar ao carrinho)
  const [clientSelectedSizes, setClientSelectedSizes] = useState<Record<string, Size>>({});

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Shipping State
  const [cep, setCep] = useState('');
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<{logradouro: string, localidade: string, uf: string} | null>(null);
  
  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderDB[]>([]);
  
  // Admin State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', 
    price: '', 
    image_url: '', 
    network_tag: 'drogaria-total', 
    category: 'Masculino', 
    description: '', 
    min_order: '10', 
    production_days: '15',
    available_sizes: [] as string[]
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- INITIALIZATION & AUTH ---
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (session) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && !profileError) {
            const user: UserType = {
              id: session.user.id,
              email: session.user.email!,
              unit_name: profile.unit_name,
              network_tag: profile.network_tag,
              role: profile.role
            };
            if (mounted) {
              setCurrentUser(user);
              localStorage.setItem('tiquinho_session', JSON.stringify(user));
            }
          } else {
             if (mounted) setCurrentUser(null);
             await supabase.auth.signOut();
          }
        }
      } catch (error) {
        console.error("Erro de inicialização:", error);
        if (mounted) setCurrentUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    
    initAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (mounted) setCurrentUser(null);
        localStorage.removeItem('tiquinho_session');
      }
    });
    
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // --- DATA FETCHING & REALTIME ---
  const fetchInitialData = async () => {
    if (!currentUser) return;
    try {
      let query = supabase.from('products').select('*').order('name');
      const { data: prodData } = await query;
      if (prodData) {
        // Ordenação alfabética consistente
        setProducts(prodData.sort((a, b) => a.name.localeCompare(b.name)));
      }

      let orderQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (currentUser.role !== 'admin') {
        orderQuery = orderQuery.eq('user_id', currentUser.id);
      }
      const { data: orderData } = await orderQuery;
      if (orderData) setOrders(orderData);

    } catch (err) { console.error('Sync error:', err); }
  };

  useEffect(() => { 
    if(currentUser) fetchInitialData(); 
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    
    // Configuração robusta do Realtime
    const channel = supabase.channel('global_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
          // Atualiza dados sempre que houver mudança, garantindo sincronia entre gestor e cliente
          fetchInitialData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          fetchInitialData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // --- HELPERS ---
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });
  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // --- SHIPPING LOGIC ---
  const calculateShipping = async () => {
    if (cep.length !== 8) {
      showToast("CEP inválido. Digite 8 números.", "error");
      return;
    }
    setIsCalculatingShipping(true);
    try {
      // Origem: 15080-325 (SP)
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      
      if (data.erro) throw new Error("CEP não encontrado");

      let cost = 0;
      if (data.uf === 'SP') {
        cost = 25.90; // Frete Estadual
      } else if (['RJ', 'MG', 'ES', 'PR', 'SC', 'RS'].includes(data.uf)) {
        cost = 45.90; // Regiões Próximas
      } else {
        cost = 78.50; // Demais regiões
      }

      setShippingCost(cost);
      setShippingAddress({
        logradouro: data.logradouro,
        localidade: data.localidade,
        uf: data.uf
      });
      showToast("Frete calculado com sucesso!", "success");

    } catch (error) {
      showToast("Erro ao calcular frete. Verifique o CEP.", "error");
      setShippingCost(null);
      setShippingAddress(null);
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  // --- PIX LOGIC ---
  const getPixCode = () => {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const total = subtotal + (shippingCost || 0);
    
    // CNPJ Tiquinho: 53424027000178
    const pix = new PixPayload(
      '53424027000178',
      'TIQUINHO UNIFORMES',
      'SAO JOSE RIO PRETO',
      total,
      `PED${Date.now().toString().slice(-6)}`
    );
    return pix.generate();
  };

  // --- AUTH ACTIONS ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
      });
      if (authError) throw authError;
      
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
      if (profileError || !profile) throw new Error('Perfil não encontrado.');
      
      const user: UserType = {
        id: authData.user.id,
        email: authData.user.email!,
        unit_name: profile.unit_name,
        network_tag: profile.network_tag,
        role: profile.role
      };
      setCurrentUser(user);
      localStorage.setItem('tiquinho_session', JSON.stringify(user));
      showToast(`Olá, ${profile.unit_name}!`);
    } catch (err: any) {
      showToast(err.message || 'Erro ao fazer login', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    if (authFlow === 'admin' && formData.adminKey !== 'TIQUINHO2026') {
      showToast("Chave Admin Inválida", "error");
      setIsLoading(false);
      return;
    }
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        options: {
          data: {
            unit_name: formData.unit_name,
            network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag,
            role: authFlow === 'admin' ? 'admin' : 'user'
          }
        }
      });
      if (authError) throw authError;
      showToast("Conta criada! Verifique seu email e faça login.", "success");
      setIsSigningUp(false);
      setFormData({ email: '', password: '', unit_name: '', network_tag: 'drogaria-total', role: 'user', adminKey: '' });
    } catch (err: any) {
      showToast(err.message || "Erro no cadastro", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthFlow('initial');
    setCart([]);
    setShippingCost(null);
    setCep('');
    localStorage.removeItem('tiquinho_session');
    setIsLoading(false);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Tratamento defensivo para tamanhos
    const safeSizes = Array.isArray(newProduct.available_sizes) ? newProduct.available_sizes : [];

    const payload = {
      name: newProduct.name,
      description: newProduct.description,
      price: parseFloat(newProduct.price),
      image_url: newProduct.image_url,
      network_tag: newProduct.network_tag.toLowerCase().trim(),
      category: newProduct.category,
      min_order: parseInt(newProduct.min_order),
      production_days: parseInt(newProduct.production_days),
      available_sizes: safeSizes
    };

    try {
      let resultData: Product; // TIPAGEM EXPLÍCITA CORRIGINDO O ERRO TS7034
      
      if (editingId) {
         const { data, error } = await supabase.from('products').update(payload).eq('id', editingId).select();
         if (error) throw error;
         if (!data || data.length === 0) throw new Error("Erro de atualização");
         
         resultData = data[0] as Product; // Cast explícito

         // Optimistic Update
         setProducts(prev => prev.map(p => p.id === editingId ? resultData : p));
      } else {
         const { data, error } = await supabase.from('products').insert([payload]).select();
         if (error) throw error;
         if (!data || data.length === 0) throw new Error("Erro de inserção");

         resultData = data[0] as Product; // Cast explícito

         // Optimistic Update
         setProducts(prev => [...prev, resultData].sort((a, b) => a.name.localeCompare(b.name)));
      }
      
      const rede = newProduct.network_tag.replace('-', ' ').toUpperCase();
      showToast(editingId ? "Produto atualizado!" : `Produto publicado para ${rede}!`);
      
      setEditingId(null);
      setNewProduct({ name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] });
    } catch (err: any) { 
       console.error(err);
       // Mensagem de erro mais amigável para o usuário se for erro de coluna
       if (err.message?.includes('available_sizes')) {
         showToast("Erro: Execute o comando SQL fornecido para corrigir o banco.", "error");
       } else {
         showToast("Erro ao salvar: " + err.message, "error"); 
       }
    }
    finally { setIsLoading(false); }
  };

  const handleDeleteProduct = async (id: string) => {
      if(!confirm("Tem certeza que deseja excluir este modelo?")) return;
      try {
          const { error } = await supabase.from('products').delete().eq('id', id);
          if (error) throw error;
          setProducts(prev => prev.filter(p => p.id !== id));
          showToast("Produto removido com sucesso.", "success");
      } catch (err) {
          showToast("Erro ao excluir produto.", "error");
      }
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity < newCart[index].min_order) {
       if(confirm(`A quantidade mínima é ${newCart[index].min_order}. Deseja remover o item?`)) {
          newCart.splice(index, 1);
       } else {
          newCart[index].quantity = newCart[index].min_order;
       }
    }
    setCart(newCart);
  };

  const handleFinalizeOrder = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const total = subtotal + (shippingCost || 0);
    
    try {
      const { error } = await supabase.from('orders').insert([{
        user_id: currentUser.id,
        unit_name: currentUser.unit_name,
        network_tag: currentUser.network_tag,
        items: cart,
        total_amount: total,
        status: 'Pago/Aguardando Produção'
      }]);

      if (error) throw error;
      showToast("Pagamento confirmado! Pedido enviado para produção.", "success");
      setCart([]);
      setShippingCost(null);
      setCep('');
      setIsPaymentOpen(false);
      setIsCartOpen(false);
      fetchInitialData();
    } catch (err) {
      showToast("Erro ao processar pedido.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (currentUser?.role === 'admin') return products;
    return products.filter(p => p.network_tag === currentUser?.network_tag);
  }, [products, currentUser]);

  const totalRevenue = useMemo(() => {
    return orders.reduce((acc, order) => acc + order.total_amount, 0);
  }, [orders]);

  // --- RENDER ---
  if (isLoading && !currentUser) return <Spinner />;

  // 1. AUTH FLOWS
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#E11D48]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#E11D48]/5 rounded-full blur-[120px]" />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        
        <AnimatePresence mode="wait">
          {authFlow === 'initial' && (
            <motion.div key="initial" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md z-10">
              <div className="flex flex-col items-center mb-10">
                <Logo className="w-20 h-20 mb-4" />
                <h1 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em]">Tiquinho Corporate</h1>
                <p className="text-zinc-600 text-xs mt-2 text-center">Plataforma de Uniformes Corporativos</p>
              </div>
              <div className="space-y-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setAuthFlow('admin')} className="w-full glass p-8 rounded-[40px] shadow-2xl hover:border-[#E11D48]/30 transition-all group">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center group-hover:bg-[#E11D48]/20 transition-colors"><ShieldCheck className="text-[#E11D48]" size={28} /></div>
                    <div className="flex-1 text-left"><h3 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Sou Gestor</h3><p className="text-zinc-500 text-xs font-medium">Gerenciar catálogo e pedidos da rede</p></div>
                  </div>
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setAuthFlow('client')} className="w-full glass p-8 rounded-[40px] shadow-2xl hover:border-[#E11D48]/30 transition-all group">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors"><ShoppingCart className="text-emerald-500" size={28} /></div>
                    <div className="flex-1 text-left"><h3 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Sou Cliente</h3><p className="text-zinc-500 text-xs font-medium">Acessar catálogo e fazer pedidos</p></div>
                  </div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {(authFlow === 'admin' || authFlow === 'client') && (
            <motion.div key="auth" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-md z-10">
              <button onClick={() => { setAuthFlow('initial'); setIsSigningUp(false); }} className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Voltar</button>
              <div className="flex flex-col items-center mb-10">
                <div className={`w-16 h-16 ${authFlow === 'admin' ? 'bg-[#E11D48]/10' : 'bg-emerald-500/10'} rounded-2xl flex items-center justify-center mb-4`}>
                    {authFlow === 'admin' ? <ShieldCheck className="text-[#E11D48]" size={32} /> : <ShoppingCart className="text-emerald-500" size={32} />}
                </div>
                <h1 className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em]">{authFlow === 'admin' ? 'Painel Gestor' : 'Portal Cliente'}</h1>
              </div>
              <div className="glass p-10 rounded-[40px] shadow-2xl">
                <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? 'Criar Conta' : 'Login Acesso'}</h2>
                <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
                  {isSigningUp && (<>
                    <input type="text" placeholder={authFlow === 'admin' ? "Nome da Empresa/Rede" : "Nome da Unidade/Franquia"} value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                    {authFlow === 'admin' ? (
                       <div className="relative"><input type="password" placeholder="Chave de Acesso Administrativa" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} className="w-full bg-zinc-900/50 border border-[#E11D48]/20 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required /><p className="text-[9px] text-zinc-600 mt-2 font-medium uppercase tracking-wider">* Solicite a chave com a equipe Tiquinho</p></div>
                    ) : (
                       <select value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm appearance-none cursor-pointer"><option value="drogaria-total">Drogaria Total</option><option value="farmacia-abc">Farmácia ABC</option><option value="generica">Rede Independente</option></select>
                    )}
                  </>)}
                  <input type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                  <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                  <button type="submit" disabled={isLoading} className={`w-full ${authFlow === 'admin' ? 'bg-[#E11D48] hover:bg-[#BE123C]' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl transition-colors disabled:opacity-50`}>{isLoading ? 'PROCESSANDO...' : (isSigningUp ? 'CRIAR CONTA' : 'ACESSAR PAINEL')}</button>
                </form>
                <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase hover:text-white transition-colors">{isSigningUp ? 'Já tenho conta' : 'Criar nova conta'}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 2. ADMIN VIEW
  if (currentUser?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-20">
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3"><Logo /><div className="flex flex-col"><h2 className="text-sm font-black uppercase tracking-tighter text-white">Central de Gestão</h2><span className="text-[9px] font-bold text-[#E11D48] tracking-widest uppercase">• Painel Administrativo</span></div></div>
          <button onClick={handleLogout} className="p-3 bg-zinc-900/50 rounded-2xl text-zinc-400 hover:text-[#E11D48] border border-white/5"><LogOut size={18} /></button>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
          
          {/* DASHBOARD PERFORMANCE */}
          <section>
            <h3 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-2"><TrendingUp className="text-[#E11D48]" /> Performance Global</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/30 border border-white/5 p-6 rounded-[32px] flex flex-col justify-between h-40">
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-2"><LayoutGrid className="text-blue-500" size={20} /></div>
                <div><span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Modelos Ativos</span><h4 className="text-3xl font-black text-white">{products.length}</h4></div>
              </div>
              <div className="bg-zinc-900/30 border border-white/5 p-6 rounded-[32px] flex flex-col justify-between h-40">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-2"><DollarSign className="text-emerald-500" size={20} /></div>
                <div><span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Receita Confirmada (PIX)</span><h4 className="text-3xl font-black text-white">{formatCurrency(totalRevenue)}</h4></div>
              </div>
              <div className="bg-zinc-900/30 border border-white/5 p-6 rounded-[32px] flex flex-col justify-between h-40">
                <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center mb-2"><TrendingUp className="text-rose-500" size={20} /></div>
                <div><span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Rede Mais Ativa</span><h4 className="text-2xl font-black text-white">Drogaria Total</h4></div>
              </div>
            </div>
          </section>

          {/* FORMULÁRIO */}
          <section className="bg-zinc-900/20 border border-white/5 rounded-[40px] p-8 overflow-hidden relative">
            <div className="absolute left-0 top-0 w-1 h-full bg-[#E11D48]" />
            <h2 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tighter"><PlusCircle className="text-[#E11D48]" /> Publicar Novo Modelo</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 flex flex-col gap-2">
                 <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Fotografia do Produto</span>
                 <div onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] bg-zinc-950 border border-white/5 rounded-[32px] flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48]/30 overflow-hidden relative group transition-all">
                  {newProduct.image_url ? ( <img src={newProduct.image_url} className="absolute inset-0 w-full h-full object-cover" /> ) : ( <div className="text-zinc-700 text-center group-hover:text-zinc-500 transition-colors"><ImageIcon className="mx-auto mb-3 w-10 h-10 stroke-1" /><p className="text-[9px] font-black uppercase tracking-widest">Upload de Imagem</p></div> )}
                  <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setNewProduct({...newProduct, image_url: reader.result as string}); reader.readAsDataURL(file); } }} className="hidden" accept="image/*" />
                </div>
              </div>
              <div className="lg:col-span-8 space-y-6">
                <div><label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Título do Uniforme *</label><input type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors placeholder:text-zinc-800" required /></div>
                
                {/* CAMPO DE DESCRIÇÃO ADICIONADO */}
                <div>
                  <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Descrição do Produto</label>
                  <textarea rows={3} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors placeholder:text-zinc-800" placeholder="Detalhes do tecido, acabamento, etc..."></textarea>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Categoria *</label>
                    <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none appearance-none font-bold cursor-pointer">
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                      <option value="Unissex">Unissex</option>
                      <option value="Inverno">Inverno</option>
                      <option value="Acessórios">Acessórios</option>
                      <option value="Operacional">Operacional</option>
                    </select>
                  </div>
                  <div><label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Preço Unitário (R$)</label><input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors" required /></div>
                </div>

                <div><label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Pedido Mínimo (Unidades)</label><div className="relative"><input type="number" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors text-center font-bold" required /><div className="absolute inset-y-0 right-4 flex items-center pointer-events-none"><Package size={14} className="text-[#E11D48]" /></div></div></div>

                <div>
                   <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Grade de Tamanhos Disponíveis *</label>
                   <div className="flex gap-2 mb-2">
                     {['P', 'M', 'G', 'GG', 'XG'].map(size => (
                       <button 
                        key={size} 
                        type="button"
                        onClick={() => {
                          const sizes = newProduct.available_sizes.includes(size) 
                            ? newProduct.available_sizes.filter(s => s !== size) 
                            : [...newProduct.available_sizes, size];
                          setNewProduct({...newProduct, available_sizes: sizes});
                        }}
                        className={`flex-1 border py-3 rounded-xl text-center text-xs font-bold transition-all ${newProduct.available_sizes.includes(size) ? 'bg-[#E11D48] border-[#E11D48] text-white' : 'bg-zinc-950 border-white/5 text-zinc-400 hover:border-white/20'}`}
                       >
                         {size}
                       </button>
                     ))}
                   </div>
                   <button 
                    type="button"
                    onClick={() => {
                      const size = 'Único';
                      const sizes = newProduct.available_sizes.includes(size) 
                        ? newProduct.available_sizes.filter(s => s !== size) 
                        : [...newProduct.available_sizes, size];
                      setNewProduct({...newProduct, available_sizes: sizes});
                    }}
                    className={`w-full border py-3 rounded-xl text-center text-xs font-bold transition-all ${newProduct.available_sizes.includes('Único') ? 'bg-[#E11D48] border-[#E11D48] text-white' : 'bg-zinc-950 border-white/5 text-zinc-400 hover:border-white/20'}`}
                   >
                     Único
                   </button>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Prazo de Confecção (Dias Úteis)</label>
                    <input 
                      type="number" 
                      value={newProduct.production_days} 
                      onChange={e => setNewProduct({...newProduct, production_days: e.target.value})} 
                      className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors" 
                      required 
                    />
                  </div>
                  <div><label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Rede Franqueada *</label><select value={newProduct.network_tag} onChange={e => setNewProduct({...newProduct, network_tag: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none appearance-none font-bold"><option value="drogaria-total">Drogaria Total</option><option value="farmacia-abc">Farmácia ABC</option><option value="generica">Uso Geral</option></select></div>
                </div>
                <button type="submit" className="w-full bg-[#E11D48] hover:bg-[#be123c] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-600/20 mt-4 transition-all flex items-center justify-center gap-2"><CheckCircle2 size={16} /> {editingId ? 'Salvar Alterações' : 'Publicar e Notificar Rede'}</button>
              </div>
            </form>
          </section>

          {/* LISTAGEM DE PRODUTOS */}
          <section className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2"><LayoutGrid className="text-[#E11D48]" /> Controle de Catálogo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900/30 p-4 rounded-[32px] border border-white/5 group hover:border-white/10 transition-colors flex items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-zinc-950 shrink-0 border border-white/5"><img src={p.image_url} className="w-full h-full object-cover" /></div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-bold text-white truncate uppercase tracking-tight mb-1">{p.name}</h4>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">{p.network_tag}</p>
                    <div className="flex items-center gap-3"><span className="text-sm font-black text-[#E11D48]">R$ {p.price.toFixed(2)}</span><span className="text-[9px] font-bold text-zinc-600 bg-zinc-950 px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1"><Package size={10} /> MÍN: {p.min_order} UN</span></div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setEditingId(p.id); setNewProduct({ name: p.name, price: p.price.toString(), image_url: p.image_url, network_tag: p.network_tag, category: p.category, description: p.description || '', min_order: p.min_order.toString(), production_days: p.production_days.toString(), available_sizes: p.available_sizes || [] }); window.scrollTo({ top: 400, behavior: 'smooth' }); }} className="flex-1 bg-zinc-800/80 hover:bg-zinc-800 py-2 rounded-xl text-[9px] uppercase font-black text-zinc-300 flex items-center justify-center gap-1 transition-colors"><MessageCircle size={10} className="rotate-90" /> Editar</button>
                      <button onClick={() => handleDeleteProduct(p.id)} className="w-8 h-8 flex items-center justify-center bg-rose-950/30 text-rose-500 rounded-xl hover:bg-rose-950/50 transition-colors"><Trash2 size={14}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* HISTÓRICO DE PAGAMENTOS */}
          <section>
             <h2 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-2"><Hourglass className="text-[#E11D48]" /> Histórico de Pagamentos</h2>
             <div className="bg-zinc-900/30 border border-white/5 rounded-[32px] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead><tr className="border-b border-white/5"><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Unidade / Rede</th><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Valor Total</th><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Status</th><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500 text-right">Data</th></tr></thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-6"><p className="text-sm font-bold text-white">{order.unit_name}</p><p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{order.network_tag.replace('-', ' ')}</p></td>
                          <td className="p-6"><p className="text-sm font-black text-[#E11D48]">{formatCurrency(order.total_amount)}</p></td>
                          <td className="p-6"><span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{order.status}</span></td>
                          <td className="p-6 text-right"><p className="text-xs font-bold text-zinc-400">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {orders.length === 0 && <div className="p-10 text-center text-zinc-600 font-bold uppercase text-xs">Nenhum pagamento registrado</div>}
                </div>
             </div>
          </section>
        </main>
      </div>
    );
  }

  // 3. CLIENT VIEW (FRANQUEADO)
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden md:flex bg-zinc-900/50 border border-white/5 rounded-full px-4 py-2 items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            <span className="font-bold text-zinc-100 text-xs">{currentUser?.network_tag.replace('-', ' ').toUpperCase()}</span>
            <span className="text-zinc-600 text-[10px] font-black">/</span>
            <span className="font-bold text-zinc-100 text-xs">{currentUser?.unit_name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="p-3 text-zinc-500 relative hover:text-white transition-colors">
            <Bell size={20} />
            <span className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-rose-500/50" />
            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full right-0 mt-2 w-64 bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl p-4 z-50">
                   <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-3 tracking-widest">Notificações</h4>
                   <div className="space-y-3">
                      {orders.length > 0 ? (
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500"><CheckCircle2 size={14} /></div>
                          <div><p className="text-xs font-bold text-white">Última compra realizada</p><p className="text-[10px] text-zinc-500">Em {new Date(orders[0].created_at).toLocaleDateString('pt-BR')}</p></div>
                        </div>
                      ) : <p className="text-xs text-zinc-600">Nenhuma notificação recente.</p>}
                   </div>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
          
          <button onClick={() => setIsHistoryOpen(true)} className="p-3 text-zinc-500 hover:text-white transition-colors">
            <List size={20} />
          </button>

          <button onClick={() => setIsCartOpen(true)} className="relative p-3 bg-zinc-900/50 rounded-2xl border border-white/5 hover:border-[#E11D48]/50 transition-colors">
            <ShoppingCart size={20} />
            {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-[#E11D48] text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-lg shadow-rose-600/50">{cart.length}</span>}
          </button>
          
          <button onClick={handleLogout} className="p-3 text-zinc-500 hover:text-rose-500"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Catálogo Oficial</h1>
            <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.2em]">Selecione os uniformes para sua unidade</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {filteredProducts.map(p => {
             // Determinar tamanho selecionado para este produto (default: primeiro da lista ou Único)
             const selectedSize = clientSelectedSizes[p.id] || (p.available_sizes && p.available_sizes.length > 0 ? p.available_sizes[0] : 'Único');
             
             return (
              <div key={p.id} className="bg-zinc-900/40 border border-white/5 rounded-[32px] overflow-hidden flex flex-col group shadow-2xl hover:border-[#E11D48]/30 transition-all">
                <div className="aspect-square bg-zinc-950 overflow-hidden relative">
                  <img src={p.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
                  
                  {/* CATEGORIA TAG */}
                  <div className="absolute top-4 right-4">
                    <span className="bg-black/60 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">
                      <Tag size={10} className="text-[#E11D48]" /> {p.category}
                    </span>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <p className="text-[10px] text-zinc-300 font-medium line-clamp-3">{p.description}</p>
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-base font-bold text-white mb-1 line-clamp-1">{p.name}</h3>
                  <p className="text-xl font-black text-[#E11D48]">R$ {p.price.toFixed(2)}</p>
                  
                  {/* SELETOR DE TAMANHOS */}
                  <div className="mt-4">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Selecione o Tamanho:</p>
                    <div className="flex flex-wrap gap-2">
                      {p.available_sizes && p.available_sizes.length > 0 ? (
                        p.available_sizes.map(size => (
                          <button
                            key={size}
                            onClick={() => setClientSelectedSizes(prev => ({...prev, [p.id]: size as Size}))}
                            className={`min-w-[32px] h-8 px-2 rounded-lg text-[10px] font-black transition-all border ${selectedSize === size ? 'bg-[#E11D48] border-[#E11D48] text-white shadow-lg shadow-rose-600/20' : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/30'}`}
                          >
                            {size}
                          </button>
                        ))
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-bold uppercase">Tamanho Único</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase"><Hourglass size={12} className="text-[#E11D48]" /> Confecção: {p.production_days} dias</div>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase"><Package size={12} className="text-[#E11D48]" /> Mínimo: {p.min_order} un</div>
                  </div>

                  {/* BOTÃO DE COMPRAR AGORA USA O TAMANHO SELECIONADO */}
                  <button 
                    onClick={() => { 
                      setCart([...cart, { ...p, selectedSize: selectedSize as Size, quantity: p.min_order }]); 
                      showToast(`Adicionado: Tamanho ${selectedSize}`); 
                    }} 
                    className="mt-6 w-full font-black py-4 rounded-2xl bg-white text-zinc-950 uppercase text-[10px] tracking-widest hover:bg-[#E11D48] hover:text-white transition-all shadow-lg hover:shadow-rose-900/20"
                  >
                    Comprar ({p.min_order} un)
                  </button>
                </div>
              </div>
             );
          })}
        </div>
      </main>

      {/* WHATSAPP BUTTON */}
      <button onClick={() => window.open(`https://wa.me/5517992198086`, '_blank')} className="fixed bottom-8 right-8 w-16 h-16 bg-[#25D366] text-white rounded-full shadow-2xl flex items-center justify-center z-[90] hover:scale-110 transition-transform shadow-emerald-500/20">
        <MessageCircle size={32} />
      </button>

      {/* CART SIDEBAR */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md" onClick={() => setIsCartOpen(false)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 z-[110] w-full max-w-md glass flex flex-col border-l border-white/10 shadow-2xl">
              <div className="p-8 border-b border-white/5 flex items-center justify-between"><h2 className="text-2xl font-black uppercase tracking-tighter">Minha Lista</h2><button onClick={() => setIsCartOpen(false)}><X size={24} /></button></div>
              <div className="flex-1 p-8 space-y-6 overflow-y-auto">
                {cart.length === 0 ? <p className="text-center py-20 uppercase font-black text-[10px] text-zinc-600 tracking-widest">Nenhum item selecionado</p> : cart.map((item, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-zinc-950/40 rounded-3xl border border-white/5">
                    <img src={item.image_url} className="w-16 h-16 object-cover rounded-xl" alt="" />
                    <div className="flex-1">
                      <h4 className="text-[10px] font-bold text-white line-clamp-1 uppercase mb-1">{item.name}</h4>
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Tamanho: {item.selectedSize}</p>
                      <div className="flex items-center gap-3">
                         <button onClick={() => updateQuantity(i, -1)} className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"><Minus size={12}/></button>
                         <span className="text-sm font-black text-[#E11D48]">{item.quantity}</span>
                         <button onClick={() => updateQuantity(i, 1)} className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"><Plus size={12}/></button>
                      </div>
                    </div>
                    <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-rose-500 self-start"><X size={16}/></button>
                  </div>
                ))}
              </div>
              
              {cart.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-zinc-950/80 space-y-4">
                  {/* CALCULO DE FRETE */}
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
                    <label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest block">Calcular Frete (CEP)</label>
                    <div className="flex gap-2">
                       <input 
                         type="text" 
                         value={cep} 
                         onChange={(e) => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))} 
                         placeholder="00000-000" 
                         className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-[#E11D48]/50 outline-none"
                       />
                       <button 
                         onClick={calculateShipping}
                         disabled={isCalculatingShipping}
                         className="bg-[#E11D48] px-4 rounded-xl text-white font-bold text-xs hover:bg-[#be123c] disabled:opacity-50"
                       >
                         {isCalculatingShipping ? <Loader2 className="animate-spin" size={14}/> : 'OK'}
                       </button>
                    </div>
                    {shippingAddress && (
                      <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-bold uppercase tracking-wider">
                         <MapPin size={10} />
                         <span>{shippingAddress.localidade}/{shippingAddress.uf}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-black uppercase text-zinc-500">Subtotal</span>
                      <span className="text-sm font-bold text-zinc-400">R$ {cart.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-black uppercase text-zinc-500">Frete</span>
                      <span className="text-sm font-bold text-zinc-400">{shippingCost !== null ? `R$ ${shippingCost.toFixed(2)}` : '--'}</span>
                    </div>
                    <div className="flex justify-between items-center px-2 border-t border-white/5 pt-2">
                      <span className="text-[10px] font-black uppercase text-white">Total Final</span>
                      <span className="text-xl font-black text-[#E11D48]">R$ {(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (shippingCost || 0)).toFixed(2)}</span>
                    </div>
                  </div>

                  <button onClick={() => setIsCartOpen(false)} className="w-full bg-zinc-800 text-zinc-300 py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest hover:bg-zinc-700 transition-colors mb-2">Continuar Comprando</button>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => { 
                         if(shippingCost === null) {
                            showToast("Calcule o frete antes de finalizar", "error");
                            return;
                         }
                         setIsCartOpen(false); 
                         setIsPaymentOpen(true); 
                      }} 
                      className="bg-[#E11D48] text-white py-4 rounded-2xl font-black uppercase text-[9px] flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 tracking-widest hover:bg-[#be123c] transition-colors"
                    >
                      <QrCode size={14}/> PAGAR COM PIX
                    </button>
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* QR CODE PAYMENT MODAL */}
      <AnimatePresence>
        {isPaymentOpen && (
           <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-zinc-950 border border-white/10 rounded-[40px] p-10 max-w-md w-full relative shadow-2xl">
                  <button onClick={() => setIsPaymentOpen(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X size={24}/></button>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center mb-6"><QrCode className="text-[#E11D48]" size={32} /></div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Pagamento PIX</h2>
                    <p className="text-zinc-500 text-xs mb-8">Escaneie o código abaixo para finalizar seu pedido.</p>
                    
                    <div className="bg-white p-4 rounded-3xl mb-8">
                      {/* GERAÇÃO REAL DO QR CODE PIX */}
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getPixCode())}`} alt="QR Code PIX" className="w-48 h-48 mix-blend-multiply" />
                    </div>
                    
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4">Total: {formatCurrency(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (shippingCost || 0))}</p>

                    <div className="flex gap-3 w-full">
                       <button onClick={() => { navigator.clipboard.writeText(getPixCode()); showToast("Código PIX Copiado!", "success"); }} className="flex-1 bg-zinc-900 text-zinc-300 py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-800"><Copy size={14}/> Copiar Código</button>
                       <button onClick={handleFinalizeOrder} className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20">{isLoading ? <Loader2 className="animate-spin" size={14}/> : 'Confirmar Pagamento'}</button>
                    </div>
                  </div>
               </motion.div>
            </motion.div>
           </>
        )}
      </AnimatePresence>

      {/* HISTORY MODAL (MEUS PEDIDOS) */}
      <AnimatePresence>
        {isHistoryOpen && (
           <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
               <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="bg-zinc-950 border border-white/10 rounded-[40px] max-w-2xl w-full max-h-[80vh] flex flex-col relative shadow-2xl">
                  <div className="p-8 border-b border-white/5 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center"><History className="text-[#E11D48]" size={24} /></div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Meu Histórico</h2>
                     </div>
                     <button onClick={() => setIsHistoryOpen(false)} className="text-zinc-500 hover:text-white"><X size={24}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-8 space-y-4">
                     {orders.length === 0 ? (
                        <div className="text-center py-20 text-zinc-600">
                           <Package size={48} className="mx-auto mb-4 opacity-20" />
                           <p className="font-bold uppercase text-xs tracking-widest">Nenhum pedido realizado ainda.</p>
                        </div>
                     ) : orders.map(order => (
                        <div key={order.id} className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl">
                           <div className="flex justify-between items-start mb-6">
                              <div>
                                 <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Pedido ID</p>
                                 <p className="text-sm font-bold text-white">#{order.id.slice(0, 8).toUpperCase()}</p>
                              </div>
                              <div className="text-right">
                                 <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Realizado em</p>
                                 <p className="text-sm font-bold text-white flex items-center gap-1 justify-end"><Calendar size={12} className="text-[#E11D48]" /> {new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                              </div>
                           </div>
                           
                           <div className="space-y-3 mb-6">
                              {(order.items as any[]).map((item: any, idx: number) => (
                                 <div key={idx} className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-zinc-300"><span className="font-bold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded text-[10px] mr-2">{item.quantity}x</span> {item.name} <span className="text-zinc-600">({item.selectedSize})</span></span>
                                    <span className="text-zinc-400">R$ {(item.price * item.quantity).toFixed(2)}</span>
                                 </div>
                              ))}
                           </div>

                           <div className="flex items-center justify-between pt-6 border-t border-white/5">
                              <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2"><CheckCircle2 size={10}/> {order.status}</span>
                              <span className="text-xl font-black text-[#E11D48]">{formatCurrency(order.total_amount)}</span>
                           </div>
                        </div>
                     ))}
                  </div>

                  <div className="p-8 border-t border-white/5">
                     <button onClick={() => setIsHistoryOpen(false)} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors">Continuar Comprando</button>
                  </div>
               </motion.div>
            </motion.div>
           </>
        )}
      </AnimatePresence>

    </div>
  );
}
