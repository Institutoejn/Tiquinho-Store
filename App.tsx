
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, Hourglass, Loader2, 
  UserPlus, LogIn, ShieldCheck, TrendingUp, DollarSign, Package, PlusCircle, 
  Trash2, Image as ImageIcon, MessageCircle, QrCode, Bell, LayoutGrid, List,
  Minus, Copy, History, ChevronRight, Calendar, Truck, MapPin, Tag, ChevronDown,
  Building2, Phone, User, Mail, Lock, Search, Send, Check
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
  total_amount: number;
  status: string;
  created_at: string;
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
  const [whatsappLink, setWhatsappLink] = useState('');
  
  const [clientSelectedSizes, setClientSelectedSizes] = useState<Record<string, Size>>({});
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
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
    name: '', price: '', image_url: '', network_tag: '', category: 'Masculino', description: '', 
    min_order: '10', production_days: '15', available_sizes: [] as string[]
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
          const nets = new Set<string>();
          const { data: profs } = await supabase.from('profiles').select('network_tag').neq('role', 'admin');
          profs?.forEach(p => p.network_tag && nets.add(p.network_tag));
          setAvailableNetworks(Array.from(nets).sort());
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if(currentUser) fetchInitialData(); }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase.channel('app_db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchInitialData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchInitialData)
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
      setCurrentUser({ id: data.user.id, email: data.user.email!, unit_name: profile.unit_name, network_tag: profile.network_tag, role: profile.role });
    } catch (err: any) { showToast(err.message, "error"); }
    finally { setIsLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    if (authFlow === 'admin' && formData.adminKey !== 'TIQUINHO2026') { setIsLoading(false); return showToast("Chave inválida", "error"); }
    try {
      const { error } = await supabase.auth.signUp({
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
      setIsRegistrationSuccess(true);
    } catch (err: any) { showToast(err.message, "error"); }
    finally { setIsLoading(false); }
  };

  const handleFinalizeOrder = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) + (shippingCost || 0);
    
    // PREPARA A MENSAGEM DO WHATSAPP ANTES (Para fallback)
    const itemsList = cart.map(i => `▪ ${i.quantity}x ${i.name} (${i.selectedSize})`).join('\n');
    let msg = `*NOVO PEDIDO (Via Site)* 🚀\n\n👤 *Cliente:* ${currentUser.unit_name}\n📦 *Itens:*\n${itemsList}\n\n💰 *Total:* R$ ${total.toFixed(2)}`;
    
    try {
      // 1. TENTA INSERIR NO SUPABASE
      const { data, error } = await supabase.from('orders').insert([{
        user_id: currentUser.id,
        unit_name: currentUser.unit_name,
        network_tag: currentUser.network_tag,
        items: cart,
        total_amount: total,
        status: 'Pendente'
      }]).select();

      // Se der erro no banco, LANÇA ERRO para cair no catch e usar WhatsApp
      if (error) throw error;
      
      const orderId = data && data[0] ? data[0].id.slice(0, 8).toUpperCase() : 'APP';
      msg = `*NOVO PEDIDO #${orderId}* 🚀\n\n👤 *Cliente:* ${currentUser.unit_name}\n📦 *Itens:*\n${itemsList}\n\n💰 *Total:* R$ ${total.toFixed(2)}\n\n✅ *Comprovante Anexo:* (Envie a foto do PIX)`;
      
      setWhatsappLink(`https://wa.me/551732167854?text=${encodeURIComponent(msg)}`);
      
      // SUCESSO: ABRE MODAL DE SUCESSO PADRÃO
      setIsPaymentOpen(false); setIsCartOpen(false); setIsOrderSuccessOpen(true);
      setCart([]); setShippingCost(null);
      
    } catch (err) { 
      // FALLBACK: SE O BANCO FALHAR, NÃO TRAVA O USUÁRIO
      console.error("Erro banco, indo para WhatsApp:", err);
      msg += `\n\n⚠️ *Nota:* O pedido não pôde ser salvo no histórico do site devido a um erro de conexão, mas segue o resumo para processamento manual.`;
      
      const waUrl = `https://wa.me/551732167854?text=${encodeURIComponent(msg)}`;
      
      // Abre WhatsApp direto
      window.open(waUrl, '_blank');
      showToast("Erro de conexão. Redirecionando para WhatsApp...", "error");
      setIsPaymentOpen(false);
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleManualWhatsapp = () => {
     if (!currentUser) return;
     const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) + (shippingCost || 0);
     const itemsList = cart.map(i => `▪ ${i.quantity}x ${i.name} (${i.selectedSize})`).join('\n');
     const msg = `*Olá! Gostaria de falar sobre meu pedido:* 💬\n\n👤 *Cliente:* ${currentUser.unit_name}\n📦 *Itens no Carrinho:*\n${itemsList}\n\n💰 *Previsão:* R$ ${total.toFixed(2)}`;
     window.open(`https://wa.me/551732167854?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleValidateOrder = async (orderId: string) => {
    if (!confirm("Confirmar recebimento do pagamento?")) return;
    try {
       await supabase.from('orders').update({ status: 'Pago/Em Produção' }).eq('id', orderId);
       showToast("Pedido validado!", "success");
    } catch { showToast("Erro ao validar", "error"); }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    const p = { ...newProduct, price: parseFloat(newProduct.price), min_order: parseInt(newProduct.min_order), production_days: parseInt(newProduct.production_days) };
    try {
      if (editingId) await supabase.from('products').update(p).eq('id', editingId);
      else await supabase.from('products').insert([p]);
      showToast("Salvo com sucesso!"); setEditingId(null);
      setNewProduct({ name: '', price: '', image_url: '', network_tag: '', category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] });
    } catch { showToast("Erro ao salvar", "error"); } finally { setIsLoading(false); }
  };

  // --- COMPUTED ---
  const totalRevenue = useMemo(() => orders.reduce((acc, order) => acc + order.total_amount, 0), [orders]);
  const mostActiveNetwork = useMemo(() => {
    if (orders.length === 0) return '---';
    const salesByNetwork: Record<string, number> = {};
    orders.forEach(order => {
      const tag = order.network_tag ? order.network_tag.trim().toLowerCase() : 'desconhecido';
      salesByNetwork[tag] = (salesByNetwork[tag] || 0) + order.total_amount;
    });
    let top = '---'; let max = 0;
    Object.entries(salesByNetwork).forEach(([tag, total]) => { if (total > max) { max = total; top = tag; } });
    return top === '---' ? top : top.replace(/-/g, ' ').toUpperCase();
  }, [orders]);

  // --- RENDER ---
  if (isLoading && !currentUser) return <Spinner />;

  // 1. LOGIN / SIGNUP VIEW
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
            <motion.div key="auth" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className={`w-full ${isSigningUp && authFlow === 'client' ? 'max-w-4xl' : 'max-w-md'} z-10 transition-all duration-500`}>
              <button onClick={() => { setAuthFlow('initial'); setIsSigningUp(false); setIsRegistrationSuccess(false); }} className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Voltar</button>
              
              {isRegistrationSuccess ? (
                <div className="glass p-10 rounded-[40px] shadow-2xl text-center">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><Mail size={40} className="text-emerald-500" /></div>
                  <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tighter">Verifique seu E-mail</h2>
                  <p className="text-zinc-400 text-sm mb-6">Enviamos um link de confirmação para <strong>{formData.email}</strong>.<br/>Por favor, clique no link para ativar sua conta corporativa.</p>
                  <button onClick={() => { setIsRegistrationSuccess(false); setIsSigningUp(false); }} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl transition-colors">Voltar para Login</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center mb-10">
                    <div className={`w-16 h-16 ${authFlow === 'admin' ? 'bg-[#E11D48]/10' : 'bg-emerald-500/10'} rounded-2xl flex items-center justify-center mb-4`}>
                        {authFlow === 'admin' ? <ShieldCheck className="text-[#E11D48]" size={32} /> : <ShoppingCart className="text-emerald-500" size={32} />}
                    </div>
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

  // 2. ADMIN VIEW
  if (currentUser?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-20">
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3"><Logo /><div className="flex flex-col"><h2 className="text-sm font-black uppercase tracking-tighter text-white">Central de Gestão</h2><span className="text-[9px] font-bold text-[#E11D48] tracking-widest uppercase">• Painel Administrativo</span></div></div>
          <button onClick={() => { supabase.auth.signOut(); setCurrentUser(null); }} className="p-3 bg-zinc-900/50 rounded-2xl text-zinc-400 hover:text-[#E11D48] border border-white/5"><LogOut size={18} /></button>
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
                <div><span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Receita Confirmada</span><h4 className="text-3xl font-black text-white">{formatCurrency(totalRevenue)}</h4></div>
              </div>
              <div className="bg-zinc-900/30 border border-white/5 p-6 rounded-[32px] flex flex-col justify-between h-40">
                <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center mb-2"><TrendingUp className="text-rose-500" size={20} /></div>
                <div><span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Rede Mais Ativa</span><h4 className="text-2xl font-black text-white">{mostActiveNetwork}</h4></div>
              </div>
            </div>
          </section>

          {/* HISTÓRICO DE PAGAMENTOS COM VALIDAÇÃO */}
          <section>
             <h2 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-2"><Hourglass className="text-[#E11D48]" /> Gestão de Pedidos</h2>
             <div className="bg-zinc-900/30 border border-white/5 rounded-[32px] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead><tr className="border-b border-white/5"><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Unidade</th><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Total</th><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Status</th><th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Ação</th></tr></thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-6"><p className="text-sm font-bold text-white">{order.unit_name}</p><p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{order.network_tag.replace('-', ' ')}</p></td>
                          <td className="p-6"><p className="text-sm font-black text-[#E11D48]">{formatCurrency(order.total_amount)}</p></td>
                          <td className="p-6"><span className={`border px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${order.status === 'Pago/Em Produção' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{order.status}</span></td>
                          <td className="p-6">
                            {order.status !== 'Pago/Em Produção' && (
                                <button onClick={() => handleValidateOrder(order.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20">
                                    <Check size={14} /> Validar Pagamento
                                </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {orders.length === 0 && <div className="p-10 text-center text-zinc-600 font-bold uppercase text-xs">Nenhum pedido registrado</div>}
                </div>
             </div>
          </section>

          {/* FORMULÁRIO DE PRODUTO */}
          <section className="bg-zinc-900/20 border border-white/5 rounded-[40px] p-8 overflow-hidden relative">
            <h2 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tighter"><PlusCircle className="text-[#E11D48]" /> Gerenciar Catálogo</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 flex flex-col gap-2">
                 <div onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] bg-zinc-950 border border-white/5 rounded-[32px] flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48]/30 overflow-hidden relative group transition-all">
                  {newProduct.image_url ? ( <img src={newProduct.image_url} className="absolute inset-0 w-full h-full object-cover" /> ) : ( <div className="text-zinc-700 text-center group-hover:text-zinc-500 transition-colors"><ImageIcon className="mx-auto mb-3 w-10 h-10 stroke-1" /><p className="text-[9px] font-black uppercase tracking-widest">Upload Imagem</p></div> )}
                  <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setNewProduct({...newProduct, image_url: reader.result as string}); reader.readAsDataURL(file); } }} className="hidden" accept="image/*" />
                </div>
              </div>
              <div className="lg:col-span-8 space-y-6">
                <input type="text" placeholder="Nome do Produto" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
                <textarea rows={2} placeholder="Descrição" value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" />
                <div className="grid grid-cols-2 gap-4">
                    <input type="number" step="0.01" placeholder="Preço (R$)" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
                    <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm"><option value="Masculino">Masculino</option><option value="Feminino">Feminino</option><option value="Unissex">Unissex</option><option value="Inverno">Inverno</option></select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <input type="number" placeholder="Mínimo" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" />
                    <input type="number" placeholder="Dias Produção" value={newProduct.production_days} onChange={e => setNewProduct({...newProduct, production_days: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" />
                </div>
                {/* Tamanhos */}
                <div className="flex gap-2">
                     {['P', 'M', 'G', 'GG', 'XG', 'Único'].map(size => (
                       <button type="button" key={size} onClick={() => { const sizes = newProduct.available_sizes.includes(size) ? newProduct.available_sizes.filter(s => s !== size) : [...newProduct.available_sizes, size]; setNewProduct({...newProduct, available_sizes: sizes}); }} className={`flex-1 border py-3 rounded-xl text-center text-xs font-bold ${newProduct.available_sizes.includes(size) ? 'bg-[#E11D48] border-[#E11D48] text-white' : 'bg-zinc-950 border-white/5 text-zinc-400'}`}>{size}</button>
                     ))}
                </div>
                <div className="relative">
                    <input type="text" list="admin-network-list" placeholder="Rede Franqueada" value={newProduct.network_tag} onChange={e => setNewProduct({...newProduct, network_tag: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm font-bold" required />
                    <datalist id="admin-network-list">{availableNetworks.map(net => <option key={net} value={net} />)}</datalist>
                </div>
                <button type="submit" className="w-full bg-[#E11D48] hover:bg-[#be123c] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-600/20 mt-4 transition-all flex items-center justify-center gap-2"><CheckCircle2 size={16} /> {editingId ? 'Salvar' : 'Publicar'}</button>
              </div>
            </form>
          </section>

          {/* LISTA DE PRODUTOS */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900/30 p-4 rounded-[32px] border border-white/5 flex items-center gap-4 group hover:border-[#E11D48]/30 transition-all">
                  <img src={p.image_url} className="w-16 h-16 rounded-xl object-cover bg-zinc-950" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-bold text-white truncate uppercase mb-1">{p.name}</h4>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase">{p.network_tag}</p>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { setEditingId(p.id); setNewProduct({ ...p, price: p.price.toString(), min_order: p.min_order.toString(), production_days: p.production_days.toString(), available_sizes: p.available_sizes || [], description: p.description || '' }); window.scrollTo({ top: 800, behavior: 'smooth' }); }} className="text-xs text-zinc-400 hover:text-white">Editar</button>
                      <button onClick={() => { if(confirm("Excluir?")) { supabase.from('products').delete().eq('id', p.id).then(() => setProducts(products.filter(pr => pr.id !== p.id))); } }} className="text-xs text-rose-500 hover:text-rose-400">Excluir</button>
                    </div>
                  </div>
                </div>
              ))}
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
                   <div className="space-y-3">{orders.length > 0 ? (<div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500"><CheckCircle2 size={14} /></div><div><p className="text-xs font-bold text-white">Última compra</p><p className="text-[10px] text-zinc-500">{orders[0].status}</p></div></div>) : <p className="text-xs text-zinc-600">Nada recente.</p>}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
          <button onClick={() => setIsHistoryOpen(true)} className="p-3 text-zinc-500 hover:text-white transition-colors"><List size={20} /></button>
          <button onClick={() => setIsCartOpen(true)} className="relative p-3 bg-zinc-900/50 rounded-2xl border border-white/5 hover:border-[#E11D48]/50 transition-colors"><ShoppingCart size={20} />{cart.length > 0 && <span className="absolute -top-1 -right-1 bg-[#E11D48] text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-lg shadow-rose-600/50">{cart.length}</span>}</button>
          <button onClick={() => { supabase.auth.signOut(); setCurrentUser(null); }} className="p-3 text-zinc-500 hover:text-rose-500"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div><h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Catálogo Oficial</h1><p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.2em]">Selecione os uniformes para sua unidade</p></div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.filter(p => (p.network_tag?.toLowerCase().trim() || '') === (currentUser?.network_tag?.toLowerCase().trim() || '')).map(p => {
             const selectedSize = clientSelectedSizes[p.id] || (p.available_sizes && p.available_sizes.length > 0 ? p.available_sizes[0] : 'Único');
             return (
              <div key={p.id} className="bg-zinc-900/40 border border-white/5 rounded-[32px] overflow-hidden flex flex-col group shadow-2xl hover:border-[#E11D48]/30 transition-all">
                <div className="aspect-square bg-zinc-950 overflow-hidden relative">
                  <img src={p.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
                  <div className="absolute top-4 right-4"><span className="bg-black/60 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/10 flex items-center gap-1"><Tag size={10} className="text-[#E11D48]" /> {p.category}</span></div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-base font-bold text-white mb-1 line-clamp-1">{p.name}</h3>
                  <p className="text-xl font-black text-[#E11D48]">R$ {p.price.toFixed(2)}</p>
                  <div className="mt-4"><p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Tamanho:</p><div className="flex flex-wrap gap-2">{p.available_sizes && p.available_sizes.length > 0 ? ( p.available_sizes.map(size => ( <button key={size} onClick={() => setClientSelectedSizes(prev => ({...prev, [p.id]: size as Size}))} className={`min-w-[32px] h-8 px-2 rounded-lg text-[10px] font-black transition-all border ${selectedSize === size ? 'bg-[#E11D48] border-[#E11D48] text-white shadow-lg shadow-rose-600/20' : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/30'}`}>{size}</button> )) ) : ( <span className="text-[10px] text-zinc-600 font-bold uppercase">Único</span> )}</div></div>
                  <button onClick={() => { setCart([...cart, { ...p, selectedSize: selectedSize as Size, quantity: p.min_order }]); showToast(`Adicionado: ${selectedSize}`); }} className="mt-6 w-full font-black py-4 rounded-2xl bg-white text-zinc-950 uppercase text-[10px] tracking-widest hover:bg-[#E11D48] hover:text-white transition-all shadow-lg hover:shadow-rose-900/20">Comprar ({p.min_order} un)</button>
                </div>
              </div>
             );
          })}
        </div>
      </main>

      <button onClick={() => window.open(`https://wa.me/551732167854`, '_blank')} className="fixed bottom-8 right-8 w-16 h-16 bg-[#25D366] text-white rounded-full shadow-2xl flex items-center justify-center z-[90] hover:scale-110 transition-transform shadow-emerald-500/20"><MessageCircle size={32} /></button>

      {/* CART SIDEBAR */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md" onClick={() => setIsCartOpen(false)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 z-[110] w-full max-w-md glass flex flex-col border-l border-white/10 shadow-2xl">
              <div className="p-8 border-b border-white/5 flex items-center justify-between"><h2 className="text-2xl font-black uppercase tracking-tighter">Minha Lista</h2><button onClick={() => setIsCartOpen(false)}><X size={24} /></button></div>
              <div className="flex-1 p-8 space-y-6 overflow-y-auto">
                {cart.length === 0 ? <p className="text-center py-20 uppercase font-black text-[10px] text-zinc-600 tracking-widest">Nenhum item</p> : cart.map((item, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-zinc-950/40 rounded-3xl border border-white/5">
                    <img src={item.image_url} className="w-16 h-16 object-cover rounded-xl" />
                    <div className="flex-1"><h4 className="text-[10px] font-bold text-white uppercase mb-1">{item.name}</h4><p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Tam: {item.selectedSize}</p><div className="flex items-center gap-3"><button onClick={() => { const newCart = [...cart]; newCart[i].quantity > newCart[i].min_order ? newCart[i].quantity-- : newCart.splice(i, 1); setCart(newCart); }} className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"><Minus size={12}/></button><span className="text-sm font-black text-[#E11D48]">{item.quantity}</span><button onClick={() => { const newCart = [...cart]; newCart[i].quantity++; setCart(newCart); }} className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"><Plus size={12}/></button></div></div>
                    <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-rose-500 self-start"><X size={16}/></button>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-zinc-950/80 space-y-4">
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
                    <label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest block">Frete (CEP)</label>
                    <div className="flex gap-2"><input type="text" value={cep} onChange={(e) => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="00000-000" className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-[#E11D48]/50 outline-none" /><button onClick={calculateShipping} disabled={isCalculatingShipping} className="bg-[#E11D48] px-4 rounded-xl text-white font-bold text-xs hover:bg-[#be123c] disabled:opacity-50">{isCalculatingShipping ? <Loader2 className="animate-spin" size={14}/> : 'OK'}</button></div>
                    {shippingAddress && <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-bold uppercase tracking-wider"><MapPin size={10} /><span>{shippingAddress.localidade}/{shippingAddress.uf}</span></div>}
                  </div>
                  <div className="space-y-2"><div className="flex justify-between items-center px-2 border-t border-white/5 pt-2"><span className="text-[10px] font-black uppercase text-white">Total</span><span className="text-xl font-black text-[#E11D48]">R$ {(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (shippingCost || 0)).toFixed(2)}</span></div></div>
                  <div className="grid grid-cols-1 gap-3">
                    <button onClick={() => { if(shippingCost === null) { showToast("Calcule o frete", "error"); return; } setIsCartOpen(false); setIsPaymentOpen(true); }} className="bg-[#E11D48] text-white py-4 rounded-2xl font-black uppercase text-[9px] flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 tracking-widest hover:bg-[#be123c] transition-colors"><QrCode size={14}/> PAGAR PIX</button>
                    <button onClick={handleManualWhatsapp} className="border border-white/10 text-zinc-400 hover:text-white py-4 rounded-2xl font-black uppercase text-[9px] flex items-center justify-center gap-2 tracking-widest hover:bg-white/5 transition-colors"> Orçamento / Dúvidas via WhatsApp</button>
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* PAGAMENTO PIX */}
      <AnimatePresence>
        {isPaymentOpen && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-zinc-950 border border-white/10 rounded-[40px] max-w-sm w-full relative shadow-2xl flex flex-col overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#E11D48] to-transparent" />
                  <div className="p-8 text-center border-b border-white/5"><div className="w-16 h-16 bg-[#E11D48]/10 rounded-full flex items-center justify-center mx-auto mb-4"><QrCode className="text-[#E11D48]" size={32} /></div><h2 className="text-xl font-black text-white uppercase tracking-tighter mb-1">Pagamento Pix</h2></div>
                  <div className="p-8 bg-white flex flex-col items-center justify-center gap-4"><div className="bg-white p-2 rounded-xl border-4 border-zinc-100"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getPixCode())}`} className="w-48 h-48 mix-blend-multiply" /></div><p className="text-zinc-950 font-black text-2xl">R$ {(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (shippingCost || 0)).toFixed(2)}</p></div>
                  <div className="p-6 bg-zinc-900/50 border-t border-white/5 space-y-4">
                     <div className="flex gap-2"><input type="text" readOnly value={getPixCode()} className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 text-[10px] text-zinc-400 font-mono outline-none" /><button onClick={() => { navigator.clipboard.writeText(getPixCode()); showToast("Copiado!", "success"); }} className="bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-xl transition-colors"><Copy size={16} /></button></div>
                     <button onClick={handleFinalizeOrder} className="w-full bg-[#E11D48] hover:bg-[#be123c] text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"><CheckCircle2 size={16} /> Já fiz o Pix (Finalizar)</button>
                     <button onClick={handleManualWhatsapp} className="w-full text-zinc-400 hover:text-emerald-400 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"><MessageCircle size={14}/> Problemas? Pagar no WhatsApp</button>
                     <button onClick={() => setIsPaymentOpen(false)} className="w-full text-zinc-600 hover:text-white py-2 text-[10px] font-bold uppercase tracking-widest transition-colors">Cancelar</button>
                  </div>
               </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* SUCESSO PEDIDO */}
      <AnimatePresence>
        {isOrderSuccessOpen && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6">
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-zinc-950 border border-[#E11D48]/20 rounded-[40px] max-w-sm w-full p-10 text-center relative shadow-2xl shadow-rose-900/20">
                 <div className="w-24 h-24 bg-[#E11D48] rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-rose-500/30"><CheckCircle2 className="text-white" size={48} /></div>
                 <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Pedido Registrado!</h2>
                 <p className="text-zinc-400 text-sm mb-8">Seu pedido foi salvo no sistema como <strong>Pendente</strong>. O envio será iniciado assim que o gestor confirmar o pagamento.</p>
                 <button onClick={() => { window.open(whatsappLink, '_blank'); setIsOrderSuccessOpen(false); }} className="w-full bg-[#25D366] hover:bg-[#1da851] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"><Send size={18} /> ENVIAR COMPROVANTE WHATSAPP</button>
                 <button onClick={() => setIsOrderSuccessOpen(false)} className="mt-6 text-zinc-600 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">Fechar</button>
              </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* HISTORICO */}
      <AnimatePresence>
        {isHistoryOpen && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
               <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="bg-zinc-950 border border-white/10 rounded-[40px] max-w-2xl w-full max-h-[80vh] flex flex-col relative shadow-2xl">
                  <div className="p-8 border-b border-white/5 flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center"><History className="text-[#E11D48]" size={24} /></div><h2 className="text-2xl font-black text-white uppercase tracking-tighter">Meu Histórico</h2></div><button onClick={() => setIsHistoryOpen(false)} className="text-zinc-500 hover:text-white"><X size={24}/></button></div>
                  <div className="flex-1 overflow-y-auto p-8 space-y-4">
                     {orders.map(order => (
                        <div key={order.id} className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl">
                           <div className="flex justify-between items-start mb-6"><div><p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">ID</p><p className="text-sm font-bold text-white">#{order.id.slice(0, 8).toUpperCase()}</p></div><div className="text-right"><p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Data</p><p className="text-sm font-bold text-white">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p></div></div>
                           <div className="space-y-3 mb-6">{(order.items as any[]).map((item: any, idx: number) => (<div key={idx} className="flex justify-between items-center text-sm"><span className="font-medium text-zinc-300"><span className="font-bold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded text-[10px] mr-2">{item.quantity}x</span> {item.name} ({item.selectedSize})</span><span className="text-zinc-400">R$ {(item.price * item.quantity).toFixed(2)}</span></div>))}</div>
                           <div className="flex items-center justify-between pt-6 border-t border-white/5"><span className={`border px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${order.status === 'Pago/Em Produção' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{order.status}</span><span className="text-xl font-black text-[#E11D48]">{formatCurrency(order.total_amount)}</span></div>
                        </div>
                     ))}
                  </div>
                  <div className="p-8 border-t border-white/5"><button onClick={() => setIsHistoryOpen(false)} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors">Voltar</button></div>
               </motion.div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
