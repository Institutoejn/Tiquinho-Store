import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, Hourglass, Loader2, 
  UserPlus, LogIn, ShieldCheck, TrendingUp, DollarSign, Package, PlusCircle, 
  Trash2, Image as ImageIcon, MessageCircle, QrCode, Bell, LayoutGrid, List,
  Minus, Copy, History, ChevronRight, Calendar, Truck, MapPin, Tag, ChevronDown,
  Building2, Phone, User, Mail, Lock, Search, Send, Check, AlertTriangle, Users as UsersIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, CartItem, Size, User as UserType } from './types';
import { supabase } from './supabaseClient';

// --- PIX HELPER ---
class PixPayload {
  private merchantKey: string;
  private merchantName: string;
  private merchantCity: string;
  private amount: string;
  private txId: string;

  constructor(key: string, name: string, city: string, amount: number, txId: string = '***') {
    this.merchantKey = key.replace(/\D/g, ''); 
    this.merchantName = this.normalizeString(name, 25); 
    this.merchantCity = this.normalizeString(city, 15); 
    this.amount = amount.toFixed(2);
    this.txId = this.normalizeString(txId, 25) || '***';
  }

  private normalizeString(str: string, limit: number): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, "").toUpperCase().substring(0, limit).trim();
  }
  private formatField(id: string, value: string): string { const len = value.length.toString().padStart(2, '0'); return `${id}${len}${value}`; }
  private getCRC16(payload: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) { if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xFFFF; else crc = (crc << 1) & 0xFFFF; }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }
  public generate(): string {
    const payload = [
      this.formatField('00', '01'),
      this.formatField('26', this.formatField('00', 'br.gov.bcb.pix') + this.formatField('01', this.merchantKey)),
      this.formatField('52', '0000'), this.formatField('53', '986'), this.formatField('54', this.amount),
      this.formatField('58', 'BR'), this.formatField('59', this.merchantName), this.formatField('60', this.merchantCity), 
      this.formatField('62', this.formatField('05', this.txId)), '6304' 
    ].join('');
    return `${payload}${this.getCRC16(payload)}`;
  }
}

// --- INTERFACES ---
interface OrderDB {
  id: string;
  user_id: string;
  unit_name: string;
  network_tag: string;
  items: CartItem[];
  total_price: number;
  status: string;
  created_at: string;
  payment_method?: string;
  user_email?: string;
  total_amount?: number;
  validated_at?: string;
  validated_by?: string;
}

// --- COMPONENTS ---
const Logo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} bg-[#E11D48] rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/30 select-none border border-white/10`}>
    <span className="text-2xl font-black text-white italic tracking-tighter -skew-x-6">T</span>
  </div>
);

const Spinner = () => (
  <div className="fixed inset-0 z-[300] bg-[#09090b] flex flex-col items-center justify-center">
    <div className="w-16 h-16 border-4 border-[#E11D48]/20 border-t-[#E11D48] rounded-full animate-spin"></div>
    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Sincronizando</p>
  </div>
);

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl glass border-white/10 ${type === 'success' ? 'text-white' : 'bg-rose-600 text-white'}`}>
      {type === 'success' ? <CheckCircle2 size={20} className="text-rose-500" /> : <AlertCircle size={20} />}
      <span className="font-semibold text-sm">{message}</span>
    </motion.div>
  );
};

export default function App() {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authFlow, setAuthFlow] = useState<'initial' | 'admin' | 'client'>('initial');
  const [adminTab, setAdminTab] = useState<'products' | 'pending' | 'history' | 'users'>('products');
  
  const [formData, setFormData] = useState({ 
    email: '', password: '', unit_name: '', network_tag: '', role: 'user' as 'user' | 'admin', 
    adminKey: '', cnpj: '', phone: '', contact_name: '', cep: '', address_street: '', address_city: '', address_state: ''
  });
  const [isRegistrationSuccess, setIsRegistrationSuccess] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isOrderSuccessOpen, setIsOrderSuccessOpen] = useState(false);
  const [orderError, setOrderError] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState('');
  
  const [clientSelectedSizes, setClientSelectedSizes] = useState<Record<string, Size>>({});
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [clientProfiles, setClientProfiles] = useState<Array<{network_tag: string, unit_name: string, email: string}>>([]);
  
  const [usersList, setUsersList] = useState<any[]>([]); // Lista de usuários para o Admin
  const [loadingUsers, setLoadingUsers] = useState(false); // Estado de carregamento dos usuários

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Shipping
  const [cep, setCep] = useState('');
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<{logradouro: string, localidade: string, uf: string} | null>(null);
  
  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderDB[]>([]);
  
  // Admin Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', price: '', image_url: '', network_tags: [] as string[], 
    category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] as string[]
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- AUTH & INIT ---
  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (profile) {
            const user: UserType = { id: session.user.id, email: session.user.email!, unit_name: profile.unit_name, network_tag: profile.network_tag, role: profile.role };
            if (mounted) { setCurrentUser(user); localStorage.setItem('tiquinho_session', JSON.stringify(user)); }
          } else { if (mounted) setCurrentUser(null); await supabase.auth.signOut(); }
        }
      } catch (err) { console.error(err); if (mounted) setCurrentUser(null); } 
      finally { if (mounted) setIsLoading(false); }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
       if (!session && mounted) { setCurrentUser(null); localStorage.removeItem('tiquinho_session'); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // --- DATA SYNC ---
  const fetchInitialData = async () => {
    if (!currentUser) return;
    try {
      const { data: prodData } = await supabase.from('products').select('*').order('name');
      if (prodData) setProducts(prodData.sort((a, b) => a.name.localeCompare(b.name)));

      let orderQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (currentUser.role !== 'admin') orderQuery = orderQuery.eq('user_id', currentUser.id);
      const { data: orderData } = await orderQuery;
      if (orderData) setOrders(orderData);

      if (currentUser.role === 'admin') {
        try {
            const { data: profs } = await supabase
                .from('profiles')
                .select('network_tag, unit_name, email')
                .neq('role', 'admin')
                .order('network_tag');
            
            if (profs) {
                const groupedMap = new Map<string, {network_tag: string, unit_name: string, email: string}>();
                profs.forEach(p => {
                    if (p.network_tag && !groupedMap.has(p.network_tag)) {
                        groupedMap.set(p.network_tag, p);
                    }
                });
                const grouped = Array.from(groupedMap.values());
                setClientProfiles(grouped);
                setAvailableNetworks(grouped.map(p => p.network_tag));
            }
        } catch (error) {
            console.error("Erro ao buscar perfis:", error);
        }
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if(currentUser) fetchInitialData(); }, [currentUser]);

  // Fetch Users for Admin (CORRECTION: Fetch ALL profiles)
  const fetchUsers = async () => {
    if (currentUser?.role !== 'admin') return;
    setLoadingUsers(true);
    try {
      // Nota: Buscamos da tabela 'profiles' que contém os dados cadastrais (unidade, rede, cargo).
      // Isso garante que todos os usuários (ativos na plataforma) sejam listados.
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setUsersList(data || []);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      showToast("Erro ao carregar usuários", "error");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (adminTab === 'users') {
      fetchUsers();
    }
  }, [adminTab]);

  const handleDeleteUser = async (userId: string) => {
    // 1. Regra de Segurança: Impedir autoexclusão
    if (userId === currentUser?.id) {
        showToast("Você não pode excluir seu próprio usuário.", "error");
        return;
    }

    // 2. Confirmação
    const confirmed = window.confirm("Deseja realmente excluir este acesso? Esta ação é permanente no banco de dados");
    if (!confirmed) return;

    try {
      // 3. Exclusão Real
      // Nota: Ao excluir de 'profiles', se houver foreign keys corretas, o usuário pode ser removido, 
      // mas a remoção real do Auth Users requer Service Role. 
      // Aqui removemos o acesso ao perfil, que efetivamente bloqueia o uso no app.
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      
      showToast("Acesso excluído com sucesso!");
      
      // 4. Atualização de Estado (Re-fetch ou Optimistic)
      setUsersList(prev => prev.filter(user => user.id !== userId));
      // Atualiza também os filtros de rede se necessário
      fetchInitialData(); 
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      showToast("Erro ao excluir usuário", "error");
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase.channel('app_db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchInitialData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchInitialData)
      // Opcional: ouvir mudanças em profiles se desejar atualização em tempo real
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser]);

  // --- LOGIC ---
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });
  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const calculateShipping = async () => {
    if (cep.length !== 8) return showToast("CEP inválido", "error");
    setIsCalculatingShipping(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) throw new Error();
      let cost = data.uf === 'SP' ? 25.90 : 78.50;
      setShippingCost(cost);
      setShippingAddress({ logradouro: data.logradouro, localidade: data.localidade, uf: data.uf });
      showToast("Frete calculado!", "success");
    } catch { showToast("Erro no CEP", "error"); setShippingCost(null); }
    finally { setIsCalculatingShipping(false); }
  };

  const getPixCode = () => {
    const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) + (shippingCost || 0);
    return new PixPayload('53424027000178', 'TIQUINHO UNIFORMES', 'SAO JOSE RIO PRETO', total, `PED${Date.now().toString().slice(-4)}`).generate();
  };

  // --- ACTIONS ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: formData.email.trim(), password: formData.password });
      if (error) throw error;
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      if (!profile) throw new Error("Perfil não encontrado. Contate o suporte.");
      setCurrentUser({ id: data.user.id, email: data.user.email!, unit_name: profile.unit_name, network_tag: profile.network_tag, role: profile.role });
    } catch (err: any) { showToast(err.message, "error"); }
    finally { setIsLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    if (authFlow === 'admin' && formData.adminKey !== 'TIQUINHO2026') { setIsLoading(false); return showToast("Chave inválida", "error"); }
    
    try {
      // 1. Cria o usuário no Auth
      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim(), password: formData.password,
        options: {
          data: {
            unit_name: formData.unit_name,
            network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag.trim(),
            role: authFlow === 'admin' ? 'admin' : 'user',
            cnpj: formData.cnpj, phone: formData.phone, contact_name: formData.contact_name,
            address: `${formData.address_street}, ${formData.address_city}-${formData.address_state}`
          }
        }
      });
      if (error) throw error;

      // 2. CORREÇÃO CRÍTICA: Insere manualmente na tabela 'profiles' para garantir que apareça no Admin
      // Isso resolve o problema de triggers ausentes ou falhando no banco.
      if (data.user) {
         // Tentamos inserir. Usamos upsert para evitar erro se o trigger já tiver criado.
         await supabase.from('profiles').upsert({
            id: data.user.id,
            email: formData.email.trim(),
            unit_name: formData.unit_name,
            network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag.trim(),
            role: authFlow === 'admin' ? 'admin' : 'user',
            updated_at: new Date().toISOString()
         }, { onConflict: 'id' });
      }

      setIsRegistrationSuccess(true);
    } catch (err: any) { showToast(err.message, "error"); }
    finally { setIsLoading(false); }
  };

  const handleFinalizePix = async () => {
    if (!currentUser || cart.length === 0) return;
    setIsLoading(true);
    try {
      const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (shippingCost || 0);
      const { data, error } = await supabase
        .from('orders')
        .insert({
          user_id: currentUser.id,
          user_email: currentUser.email,
          unit_name: currentUser.unit_name,
          items: cart,
          total_price: total,
          status: 'AGUARDANDO VALIDAÇÃO',
          payment_method: 'PIX'
        })
        .select()
        .single();
      
      if (error) throw error;
      setCart([]); setIsCartOpen(false); setIsPaymentOpen(false);
      setIsOrderSuccessOpen(true); showToast('Pedido enviado! Aguarde validação do pagamento.', 'success');
    } catch (error: any) {
      console.error('Erro completo:', error); showToast('Erro ao finalizar pedido. Tente novamente.', 'error');
    } finally { setIsLoading(false); }
  };

  const handleManualWhatsapp = () => {
     if (!currentUser) return;
     const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) + (shippingCost || 0);
     const itemsList = cart.map(i => `▪ ${i.quantity}x ${i.name} (${i.selectedSize})`).join('\n');
     const msg = `*Olá! Gostaria de falar sobre meu pedido:* 💬\n\n👤 *Cliente:* ${currentUser.unit_name}\n📦 *Itens no Carrinho:*\n${itemsList}\n\n💰 *Previsão:* R$ ${total.toFixed(2)}`;
     window.open(`https://wa.me/551732167854?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    const p = { ...newProduct, price: parseFloat(newProduct.price), min_order: parseInt(newProduct.min_order), production_days: parseInt(newProduct.production_days) };
    
    if (p.network_tags.length === 0) {
        showToast("Selecione pelo menos uma rede ou 'Todos os Clientes'", "error");
        setIsLoading(false);
        return;
    }

    let targetTags = p.network_tags;
    
    if (targetTags.includes('*')) {
        const allProfileTags = clientProfiles.map(cp => cp.network_tag);
        
        if (allProfileTags.length === 0) {
             showToast("Não há clientes cadastrados para aplicar 'Todos'. Adicione redes manualmente.", "error");
             setIsLoading(false);
             return;
        }
        targetTags = allProfileTags;
    }
    
    targetTags = [...new Set(targetTags)].filter(t => t !== '*');

    const productsToSave = targetTags.map(tag => ({
        name: p.name, description: p.description, price: p.price, image_url: p.image_url,
        network_tag: tag, category: p.category, min_order: p.min_order,
        production_days: p.production_days, available_sizes: p.available_sizes
    }));

    try {
        if (editingId) {
            await supabase.from('products').delete().eq('id', editingId);
            await supabase.from('products').insert(productsToSave);
        } else {
            await supabase.from('products').insert(productsToSave);
        }
        showToast(`Produto ${editingId ? 'atualizado' : 'publicado'}!`);
        setEditingId(null);
        setNewProduct({ name: '', price: '', image_url: '', network_tags: [], category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] });
        await fetchInitialData();
    } catch (err) { showToast("Erro ao salvar", "error"); } finally { setIsLoading(false); }
  };

  // --- SUB-COMPONENTES ---
  const OrdersManagement = () => {
    const [ordersList, setOrdersList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchOrders(); }, []);

    const fetchOrders = async () => {
      try {
        const { data, error } = await supabase.from('orders').select(`*`).order('created_at', { ascending: false });
        if (error) throw error;
        setOrdersList(data || []);
      } catch (err) { console.error('Erro ao buscar pedidos:', err); } finally { setLoading(false); }
    };

    const handleValidateOrder = async (orderId: string, approve: boolean) => {
      try {
        const { error } = await supabase.from('orders').update({
            status: approve ? 'PAGO/AGUARDANDO PRODUÇÃO' : 'PAGAMENTO RECUSADO',
            validated_by: currentUser?.id,
            validated_at: new Date().toISOString()
          }).eq('id', orderId);
        if (error) throw error;
        showToast(approve ? 'Pedido aprovado!' : 'Pedido recusado', 'success');
        fetchOrders();
      } catch (err) { showToast('Erro ao validar pedido', 'error'); }
    };

    if (loading) return <div className="text-center py-12 text-zinc-600"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /><p className="text-xs uppercase font-black">Carregando pedidos...</p></div>;

    const pendingOrders = ordersList.filter(o => o.status === 'AGUARDANDO VALIDAÇÃO');

    if (pendingOrders.length === 0) return (
        <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <p className="text-zinc-500 uppercase font-black text-xs">Nenhum pedido pendente</p>
        </div>
      );

    return (
      <div className="space-y-4">
        {pendingOrders.map((order) => (
          <div key={order.id} className="bg-zinc-900/30 border border-white/5 rounded-[32px] p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-white mb-1">{order.unit_name}</h3>
                <p className="text-[10px] text-zinc-500 uppercase font-bold">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="text-right"><p className="text-xs text-zinc-500 uppercase font-bold mb-1">Total</p><p className="text-xl font-black text-[#E11D48]">{formatCurrency(order.total_price || order.total_amount || 0)}</p></div>
            </div>
            <div className="bg-zinc-950/40 rounded-2xl p-4 mb-4">
              <p className="text-[10px] text-zinc-600 uppercase font-black mb-2">Itens do Pedido</p>
              <div className="space-y-2">{order.items.map((item: any, idx: number) => (<div key={idx} className="flex justify-between text-xs"><span className="text-zinc-400">{item.name} ({item.selectedSize})</span><span className="text-white font-bold">{item.quantity}x R$ {item.price.toFixed(2)}</span></div>))}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleValidateOrder(order.id, false)} className="flex-1 bg-rose-600/10 text-rose-500 py-3 rounded-xl font-black uppercase text-[9px] hover:bg-rose-600/20 transition-colors">Recusar</button>
              <button onClick={() => handleValidateOrder(order.id, true)} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[9px] hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20">Aprovar Pagamento</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const OrdersHistory = () => {
    const [ordersHistory, setOrdersHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all');

    useEffect(() => { fetchAllOrders(); }, []);

    const fetchAllOrders = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setOrdersHistory(data || []);
      } catch (err) { console.error('Erro ao buscar histórico:', err); showToast('Erro ao carregar histórico', 'error'); } finally { setLoading(false); }
    };

    const filteredOrders = ordersHistory.filter(order => {
      if (filter === 'all') return true;
      if (filter === 'approved') return order.status === 'PAGO/AGUARDANDO PRODUÇÃO';
      if (filter === 'rejected') return order.status === 'PAGAMENTO RECUSADO';
      return true;
    });

    const stats = {
      total: ordersHistory.length,
      pending: ordersHistory.filter(o => o.status === 'AGUARDANDO VALIDAÇÃO').length,
      approved: ordersHistory.filter(o => o.status === 'PAGO/AGUARDANDO PRODUÇÃO').length,
      rejected: ordersHistory.filter(o => o.status === 'PAGAMENTO RECUSADO').length,
      totalRevenue: ordersHistory.filter(o => o.status === 'PAGO/AGUARDANDO PRODUÇÃO').reduce((acc, o) => acc + (o.total_price || o.total_amount || 0), 0)
    };

    const getStatusBadge = (status: string) => {
      if (status === 'AGUARDANDO VALIDAÇÃO') return <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-full text-[9px] font-black uppercase">Pendente</span>;
      if (status === 'PAGO/AGUARDANDO PRODUÇÃO') return <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[9px] font-black uppercase">Aprovado</span>;
      if (status === 'PAGAMENTO RECUSADO') return <span className="px-3 py-1 bg-rose-500/10 text-rose-500 rounded-full text-[9px] font-black uppercase">Recusado</span>;
      return <span className="px-3 py-1 bg-zinc-500/10 text-zinc-500 rounded-full text-[9px] font-black uppercase">{status}</span>;
    };

    if (loading) return <div className="text-center py-20 text-zinc-600"><Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" /><p className="text-xs uppercase font-black tracking-widest">Carregando histórico...</p></div>;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-zinc-900/40 border border-white/5 rounded-[32px] p-6"><p className="text-[10px] text-zinc-500 uppercase font-black mb-2">Total Pedidos</p><p className="text-3xl font-black text-white">{stats.total}</p></div>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-[32px] p-6"><p className="text-[10px] text-yellow-600 uppercase font-black mb-2">Pendentes</p><p className="text-3xl font-black text-yellow-500">{stats.pending}</p></div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[32px] p-6"><p className="text-[10px] text-emerald-600 uppercase font-black mb-2">Aprovados</p><p className="text-3xl font-black text-emerald-500">{stats.approved}</p></div>
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-[32px] p-6"><p className="text-[10px] text-rose-600 uppercase font-black mb-2">Recusados</p><p className="text-3xl font-black text-rose-500">{stats.rejected}</p></div>
          <div className="bg-[#E11D48]/5 border border-[#E11D48]/20 rounded-[32px] p-6"><p className="text-[10px] text-rose-600 uppercase font-black mb-2">Faturamento</p><p className="text-2xl font-black text-[#E11D48]">{formatCurrency(stats.totalRevenue)}</p></div>
        </div>
        <div className="flex gap-3 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 w-fit">
          <button onClick={() => setFilter('all')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${filter === 'all' ? 'bg-[#E11D48] text-white' : 'text-zinc-500 hover:text-white'}`}>Todos</button>
          <button onClick={() => setFilter('approved')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${filter === 'approved' ? 'bg-emerald-600 text-white' : 'text-zinc-500 hover:text-white'}`}>Aprovados</button>
          <button onClick={() => setFilter('rejected')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${filter === 'rejected' ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:text-white'}`}>Recusados</button>
        </div>
        {filteredOrders.length === 0 ? <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-12 text-center"><Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" /><p className="text-zinc-600 uppercase font-black text-xs">Nenhum pedido encontrado</p></div> : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-zinc-900/30 border border-white/5 rounded-[32px] p-6 hover:border-white/10 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2"><h3 className="text-base font-black text-white">{order.unit_name}</h3>{getStatusBadge(order.status)}</div>
                    <p className="text-xs text-zinc-500 font-medium">{order.user_email}</p>
                    <p className="text-[10px] text-zinc-600 uppercase font-bold mt-1">Pedido #{order.id.slice(0, 8).toUpperCase()} • {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="text-right"><p className="text-2xl font-black text-[#E11D48]">{formatCurrency(order.total_price || order.total_amount || 0)}</p><p className="text-[9px] text-zinc-600 uppercase font-bold mt-1">{order.payment_method || 'PIX'}</p></div>
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-[10px] text-zinc-500 uppercase font-black hover:text-white transition-colors list-none flex items-center gap-2"><svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg> Ver {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</summary>
                  <div className="mt-4 bg-zinc-950/40 rounded-2xl p-4 space-y-2">{order.items.map((item: any, idx: number) => (<div key={idx} className="flex items-center justify-between text-sm"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-zinc-900 overflow-hidden"><img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /></div><span className="text-zinc-300 font-medium">{item.name} ({item.selectedSize})</span></div><span className="text-white font-bold">{item.quantity}x R$ {item.price.toFixed(2)}</span></div>))}</div>
                </details>
                {order.validated_at && <div className="mt-4 pt-4 border-t border-white/5 text-[9px] text-zinc-600">Validado em {new Date(order.validated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ClientOrderHistory = ({ userId }: { userId: string }) => {
    const [historyOrders, setHistoryOrders] = useState<any[]>([]);
    useEffect(() => {
      const fetchHistory = async () => {
        const { data } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (data) setHistoryOrders(data);
      };
      fetchHistory();
    }, [userId]);
    const getStatusColor = (status: string) => {
      if (status.includes('AGUARDANDO')) return 'text-yellow-500';
      if (status.includes('PAGO')) return 'text-emerald-500';
      if (status.includes('RECUSADO')) return 'text-rose-500';
      return 'text-zinc-500';
    };
    if (historyOrders.length === 0) return <div className="bg-zinc-900/30 border border-white/5 rounded-[32px] p-12 text-center"><Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" /><p className="text-zinc-600 uppercase font-black text-xs">Nenhum pedido realizado</p></div>;
    return (
      <div className="grid gap-4">
        {historyOrders.map((order) => (
          <div key={order.id} className="bg-zinc-900/30 border border-white/5 rounded-[32px] p-6 flex items-center justify-between">
            <div className="flex-1"><p className="text-xs text-zinc-500 uppercase font-bold mb-1">Pedido #{order.id.slice(0, 8).toUpperCase()}</p><p className="text-sm font-black text-white mb-2">{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</p><p className={`text-[10px] uppercase font-black ${getStatusColor(order.status)}`}>{order.status}</p></div>
            <div className="text-right"><p className="text-xl font-black text-[#E11D48]">{formatCurrency(order.total_price || order.total_amount || 0)}</p><p className="text-[9px] text-zinc-600 mt-1">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p></div>
          </div>
        ))}
      </div>
    );
  };

  const totalRevenue = useMemo(() => orders.reduce((acc, order) => acc + (order.total_price || order.total_amount || 0), 0), [orders]);
  const mostActiveNetwork = useMemo(() => {
    if (orders.length === 0) return '---';
    const salesByNetwork: Record<string, number> = {};
    orders.forEach(order => {
      const tag = order.network_tag ? order.network_tag.trim().toLowerCase() : 'desconhecido';
      salesByNetwork[tag] = (salesByNetwork[tag] || 0) + (order.total_price || order.total_amount || 0);
    });
    let top = '---'; let max = 0;
    Object.entries(salesByNetwork).forEach(([tag, total]) => { if (total > max) { max = total; top = tag; } });
    return top === '---' ? top : top.replace(/-/g, ' ').toUpperCase();
  }, [orders]);

  if (isLoading && !currentUser) return <Spinner />;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#E11D48]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#E11D48]/5 rounded-full blur-[120px]" />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <AnimatePresence mode="wait">
          {authFlow === 'initial' && (
            <motion.div key="initial" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md z-10">
              <div className="flex flex-col items-center mb-10"><Logo className="w-20 h-20 mb-4" /><h1 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em]">Tiquinho Corporate</h1><p className="text-zinc-600 text-xs mt-2 text-center">Plataforma de Uniformes Corporativos</p></div>
              <div className="space-y-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setAuthFlow('admin')} className="w-full glass p-8 rounded-[40px] shadow-2xl hover:border-[#E11D48]/30 transition-all group">
                  <div className="flex items-start gap-4"><div className="w-14 h-14 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center group-hover:bg-[#E11D48]/20 transition-colors"><ShieldCheck className="text-[#E11D48]" size={28} /></div><div className="flex-1 text-left"><h3 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Sou Gestor</h3><p className="text-zinc-500 text-xs font-medium">Gerenciar catálogo e pedidos da rede</p></div></div>
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setAuthFlow('client')} className="w-full glass p-8 rounded-[40px] shadow-2xl hover:border-[#E11D48]/30 transition-all group">
                  <div className="flex items-start gap-4"><div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors"><ShoppingCart className="text-emerald-500" size={28} /></div><div className="flex-1 text-left"><h3 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Sou Cliente</h3><p className="text-zinc-500 text-xs font-medium">Acessar catálogo e fazer pedidos</p></div></div>
                </motion.button>
              </div>
            </motion.div>
          )}
          {(authFlow === 'admin' || authFlow === 'client') && (
            <motion.div key="auth" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className={`w-full ${isSigningUp && authFlow === 'client' ? 'max-w-4xl' : 'max-w-md'} z-10 transition-all duration-500`}>
              <button onClick={() => { setAuthFlow('initial'); setIsSigningUp(false); setIsRegistrationSuccess(false); }} className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Voltar</button>
              {isRegistrationSuccess ? (
                <div className="glass p-10 rounded-[40px] shadow-2xl text-center">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><Mail size={40} className="text-emerald-500" /></div><h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tighter">Verifique seu E-mail</h2><p className="text-zinc-400 text-sm mb-6">Enviamos um link de confirmação para <strong>{formData.email}</strong>.<br/>Por favor, clique no link para ativar sua conta corporativa.</p><button onClick={() => { setIsRegistrationSuccess(false); setIsSigningUp(false); }} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl transition-colors">Voltar para Login</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center mb-10">
                    <div className={`w-16 h-16 ${authFlow === 'admin' ? 'bg-[#E11D48]/10' : 'bg-emerald-500/10'} rounded-2xl flex items-center justify-center mb-4`}>{authFlow === 'admin' ? <ShieldCheck className="text-[#E11D48]" size={32} /> : <ShoppingCart className="text-emerald-500" size={32} />}</div>
                    <h1 className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em]">{authFlow === 'admin' ? 'Painel Gestor' : 'Portal Cliente'}</h1>
                  </div>
                  <div className="glass p-10 rounded-[40px] shadow-2xl">
                    <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? (authFlow === 'admin' ? 'Criar Conta Admin' : 'Cadastro Corporativo') : 'Login Acesso'}</h2>
                    <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
                      {isSigningUp ? (
                         authFlow === 'admin' ? (
                            <>
                              <input type="text" placeholder="Nome da Empresa/Rede" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                              <div className="relative"><input type="password" placeholder="Chave de Acesso Administrativa" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} className="w-full bg-zinc-900/50 border border-[#E11D48]/20 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required /></div>
                              <input type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                              <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                            </>
                         ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1 border-b border-white/5 pb-1">Dados da Empresa</div>
                                <div className="relative">
                                  <input type="text" list="network-suggestions" placeholder="Rede / Franquia *" value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                                  <datalist id="network-suggestions">{availableNetworks.map(net => <option key={net} value={net} />)}</datalist>
                                  <Search className="absolute right-4 top-4 text-zinc-600 pointer-events-none" size={16} />
                                </div>
                                <input type="text" placeholder="Nome da Unidade *" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                                <input type="text" placeholder="CNPJ *" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value.replace(/\D/g, '').slice(0, 14)})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                                <input type="text" placeholder="Telefone *" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                                <input type="text" placeholder="Nome Responsável" value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} className="md:col-span-2 w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" />
                                <div className="md:col-span-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest mt-4 mb-1 border-b border-white/5 pb-1">Endereço</div>
                                <div className="relative"><input type="text" placeholder="CEP *" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value.replace(/\D/g, '').slice(0, 8)})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required /></div>
                                <input type="text" placeholder="Cidade" value={formData.address_city} readOnly className="w-full bg-zinc-900/20 border border-white/5 p-4 rounded-2xl text-zinc-400 text-sm cursor-not-allowed" />
                                <input type="text" placeholder="Logradouro" value={formData.address_street} readOnly className="md:col-span-2 w-full bg-zinc-900/20 border border-white/5 p-4 rounded-2xl text-zinc-400 text-sm cursor-not-allowed" />
                                <div className="md:col-span-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest mt-4 mb-1 border-b border-white/5 pb-1">Acesso</div>
                                <input type="email" placeholder="E-mail *" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="md:col-span-2 w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                                <input type="password" placeholder="Senha *" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="md:col-span-2 w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                            </div>
                         )
                      ) : (
                        <>
                           <input type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                           <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                        </>
                      )}
                      <button type="submit" disabled={isLoading} className={`w-full ${authFlow === 'admin' ? 'bg-[#E11D48] hover:bg-[#BE123C]' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl transition-colors disabled:opacity-50 mt-6`}>{isLoading ? 'PROCESSANDO...' : (isSigningUp ? 'FINALIZAR CADASTRO' : 'ACESSAR PAINEL')}</button>
                    </form>
                    <button onClick={() => { setIsSigningUp(!isSigningUp); setFormData(prev => ({...prev, email: '', password: ''})); }} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase hover:text-white transition-colors">{isSigningUp ? 'Já tenho conta' : 'Criar nova conta'}</button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
}