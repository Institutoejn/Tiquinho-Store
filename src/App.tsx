import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, 
  ShieldCheck, Package, Trash2, Image as ImageIcon, QrCode, Minus, Copy, 
  Search, Factory, Users as UsersIcon, Bell, 
  LayoutGrid, List, History, Wallet, TrendingUp, PlusCircle, Tag, Check, ChevronDown, ChevronRight, Clock, MessageCircle, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, CartItem, Size, User as UserType } from '../types';
import { supabase } from '../supabaseClient';

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
  
  private formatField(id: string, value: string): string { 
    const len = value.length.toString().padStart(2, '0'); 
    return `${id}${len}${value}`; 
  }
  
  private getCRC16(payload: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) { 
        if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xFFFF; 
        else crc = (crc << 1) & 0xFFFF; 
      }
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

// --- TYPES LOCAL ---
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
    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Carregando</p>
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
  
  // Admin Tabs
  const [adminTab, setAdminTab] = useState<'products' | 'pending' | 'history' | 'users'>('products');
  
  // Admin Filters
  const [historyFilter, setHistoryFilter] = useState('TODOS');
  const [productFilter, setProductFilter] = useState('TODOS'); 
  const [expandedHistoryOrder, setExpandedHistoryOrder] = useState<string | null>(null);

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderDB[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [clientProfiles, setClientProfiles] = useState<Array<{id: string, network_tag: string, unit_name: string, email: string}>>([]);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  
  // Forms & UI
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [formData, setFormData] = useState({ 
    email: '', password: '', unit_name: '', network_tag: '', role: 'user' as 'user' | 'admin', 
    adminKey: '', cnpj: '', phone: '', contact_name: '', cep: '', 
    address_street: '', address_city: '', address_state: ''
  });
  const [isRegistrationSuccess, setIsRegistrationSuccess] = useState(false);
  
  // Admin Product Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', price: '', image_url: '', additional_images: [] as string[], network_tags: [] as string[], 
    category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] as string[]
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileRef1 = useRef<HTMLInputElement>(null);
  const extraFileRef2 = useRef<HTMLInputElement>(null);
  const extraFileRef3 = useRef<HTMLInputElement>(null);
  
  const SIZES_OPTIONS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'G1', 'G2', 'Único'];

  // Client Cart & Checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isOrderSuccessOpen, setIsOrderSuccessOpen] = useState(false);
  const [clientSelectedSizes, setClientSelectedSizes] = useState<Record<string, Size>>({});
  const [detailsModalOpenId, setDetailsModalOpenId] = useState<string | null>(null);
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);
  
  // New Client Features
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  // Shipping
  const [cep, setCep] = useState('');
  const [shippingCost, setShippingCost] = useState<number | null>(null);

  // --- INIT ---
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Tabela 'users' conforme solicitado
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        if (profile) {
          setCurrentUser({ id: session.user.id, email: session.user.email!, unit_name: profile.unit_name, network_tag: profile.network_tag, role: profile.role });
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const fetchOrders = async () => {
      if (!currentUser) return;
      let orderQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (currentUser.role !== 'admin') orderQuery = orderQuery.eq('user_id', currentUser.id);
      const { data: orderData } = await orderQuery;
      if (orderData) {
          if (orders.length > 0 && orderData.length === orders.length) {
              if (orderData[0].status !== orders[0].status) {
                  showToast(`Status do pedido atualizado: ${orderData[0].status}`);
              }
          }
          setOrders(orderData);
      }
  };

  const fetchInitialData = async () => {
    if (!currentUser) return;
    
    // Products
    const { data: prodData } = await supabase.from('products').select('*').order('name');
    if (prodData) setProducts(prodData);

    // Orders
    await fetchOrders();

    // Admin specific data
    if (currentUser.role === 'admin') {
      // Tabela 'users' conforme solicitado
      const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (users) {
        setUsersList(users);
        const profs = users.filter((u: any) => u.role !== 'admin');
        setClientProfiles(profs);
        setAvailableNetworks([...new Set(profs.map((u: any) => u.network_tag))] as string[]);
      }
    }
  };

  // Polling
  useEffect(() => {
      if (!currentUser) return;
      fetchInitialData();
      const interval = setInterval(() => { fetchOrders(); }, 5000);
      return () => clearInterval(interval);
  }, [currentUser]);

  // --- ACTIONS ---
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });
  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const calculateShipping = async () => {
    if (cep.length !== 8) return showToast("CEP inválido", "error");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) throw new Error();
      setShippingCost(data.uf === 'SP' ? 25.90 : 78.50);
    } catch { showToast("Erro no CEP", "error"); }
  };

  const getPixCode = () => {
    const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) + (shippingCost || 0);
    return new PixPayload('53424027000178', 'TIQUINHO UNIFORMES', 'SAO JOSE RIO PRETO', total, `PED${Date.now().toString().slice(-4)}`).generate();
  };

  const handleWhatsAppQuote = () => {
      const total = cart.reduce((a,b)=>a+b.price*b.quantity,0) + (shippingCost || 0);
      let message = `*SOLICITAÇÃO DE ORÇAMENTO*\n`;
      message += `*Cliente:* ${currentUser?.unit_name}\n`;
      message += `*Rede:* ${currentUser?.network_tag}\n\n`;
      message += `*ITENS DO PEDIDO:*\n`;
      cart.forEach(item => { message += `• ${item.quantity}x ${item.name} (Tam: ${item.selectedSize}) - ${formatCurrency(item.price)}\n`; });
      if(shippingCost) message += `\n*Frete:* ${formatCurrency(shippingCost)} (CEP: ${cep})\n`;
      message += `\n*TOTAL APROXIMADO:* ${formatCurrency(total)}`;
      window.open(`https://wa.me/551732167854?text=${encodeURIComponent(message)}`, '_blank');
  };

  const checkCep = async () => {
    if (formData.cep.length !== 8) return;
    try {
        const res = await fetch(`https://viacep.com.br/ws/${formData.cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
            setFormData(prev => ({ ...prev, address_street: data.logradouro || '', address_city: data.localidade || '', address_state: data.uf || '' }));
        }
    } catch (e) { console.error(e); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: formData.email, password: formData.password });
      if (error) throw error;
      // Tabela 'users'
      const { data: profile } = await supabase.from('users').select('*').eq('id', data.user.id).single();
      
      // Se por algum motivo o trigger falhou e não criou o perfil, tenta buscar o usuario basico
      if (!profile) {
          throw new Error("Perfil não encontrado ou pendente de criação.");
      }

      setCurrentUser({ id: data.user.id, email: data.user.email!, unit_name: profile.unit_name, network_tag: profile.network_tag, role: profile.role });
    } catch (err: any) { showToast(err.message, "error"); } finally { setIsLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setIsLoading(true);
    
    if (authFlow === 'admin' && formData.adminKey !== 'TIQUINHO2026') { 
        setIsLoading(false); 
        return showToast("Chave inválida", "error"); 
    }
    
    try {
      // ENVIANDO DADOS VIA METADATA
      // Isso permite que o Trigger SQL capture os dados e crie o usuário na tabela 'users' automaticamente
      const { data, error } = await supabase.auth.signUp({ 
          email: formData.email, 
          password: formData.password,
          options: {
              data: {
                  unit_name: formData.unit_name,
                  network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag,
                  role: authFlow === 'admin' ? 'admin' : 'user',
                  cnpj: formData.cnpj,
                  phone: formData.phone,
                  contact_name: formData.contact_name,
                  cep: formData.cep,
                  address_street: formData.address_street,
                  address_city: formData.address_city,
                  address_state: formData.address_state
              }
          }
      });

      if (error) throw error;

      if (data.user) {
         showToast("Cadastro realizado! Faça login.", "success");
         setIsSigningUp(false);
      }
    } catch (err: any) { 
        showToast(err.message, "error"); 
    } finally { 
        setIsLoading(false); 
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
          const result = reader.result as string;
          if (index === -1) {
              setNewProduct({...newProduct, image_url: result});
          } else {
              const currentImages = [...(newProduct.additional_images || [])];
              while(currentImages.length <= index) currentImages.push('');
              currentImages[index] = result;
              setNewProduct({...newProduct, additional_images: currentImages});
          }
      };
      reader.readAsDataURL(file);
  };

  const removeAdditionalImage = (index: number) => {
      const currentImages = [...(newProduct.additional_images || [])];
      currentImages.splice(index, 1);
      setNewProduct({...newProduct, additional_images: currentImages});
  };

  const handleProductSubmit = async () => {
    let targetTags = newProduct.network_tags; 
    if (targetTags.length === 0) return showToast("Selecione pelo menos uma rede ou 'Todos'", "error");
    const prods = targetTags.map(tag => ({
        name: newProduct.name, description: newProduct.description, price: parseFloat(newProduct.price), 
        image_url: newProduct.image_url, additional_images: newProduct.additional_images, network_tag: tag, category: newProduct.category, 
        min_order: parseInt(newProduct.min_order), production_days: parseInt(newProduct.production_days), 
        available_sizes: newProduct.available_sizes
    }));
    if (editingId) await supabase.from('products').delete().eq('id', editingId);
    await supabase.from('products').insert(prods);
    showToast("Salvo!"); fetchInitialData(); setEditingId(null);
    setNewProduct({ name: '', price: '', image_url: '', additional_images: [], network_tags: [], category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] });
  };

  const toggleSize = (size: string) => {
      const current = newProduct.available_sizes || [];
      if (current.includes(size)) setNewProduct({...newProduct, available_sizes: current.filter(s => s !== size)});
      else setNewProduct({...newProduct, available_sizes: [...current, size]});
  };

  const toggleNetwork = (tag: string) => {
      const current = newProduct.network_tags || [];
      if (tag === '*') {
          if (current.includes('*')) setNewProduct({...newProduct, network_tags: []});
          else setNewProduct({...newProduct, network_tags: ['*']});
          return;
      }
      let newTags = current.filter(t => t !== '*');
      if (newTags.includes(tag)) newTags = newTags.filter(t => t !== tag);
      else newTags.push(tag);
      setNewProduct({...newProduct, network_tags: newTags});
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
      await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      showToast(`Status atualizado para: ${newStatus}`);
      fetchOrders(); 
  };
  
  const handleDeleteUser = async (id: string) => {
      if(!confirm("Excluir usuário?")) return;
      await supabase.from('users').delete().eq('id', id);
      fetchInitialData();
      showToast("Usuário excluído");
  };

  const handleFinalize = async () => {
      const total = cart.reduce((a, b) => a + b.price * b.quantity, 0) + (shippingCost || 0);
      await supabase.from('orders').insert({
          user_id: currentUser!.id, user_email: currentUser!.email, unit_name: currentUser!.unit_name,
          items: cart, total_price: total, status: 'AGUARDANDO VALIDAÇÃO', payment_method: 'PIX',
          network_tag: currentUser!.network_tag
      });
      setCart([]); setIsCartOpen(false); setIsPaymentOpen(false); setIsOrderSuccessOpen(true);
      fetchOrders(); 
  };

  // --- RENDER ---
  if (isLoading) return <Spinner />;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6">
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <div className="w-full max-w-md">
            {authFlow === 'initial' ? (
                <div className="flex flex-col items-center gap-6">
                    <div className="w-24 h-24 bg-[#E11D48] rounded-[32px] flex items-center justify-center mb-4 shadow-2xl shadow-rose-600/20">
                        <span className="text-5xl font-black text-white italic -skew-x-6">T</span>
                    </div>
                    <div className="text-center mb-8">
                        <h2 className="text-xs font-bold tracking-[0.4em] text-zinc-500 uppercase mb-1">Tiquinho Corporate</h2>
                        <p className="text-zinc-600 text-[10px]">Plataforma de Uniformes Corporativos</p>
                    </div>

                    <button onClick={() => setAuthFlow('admin')} className="w-full glass p-8 rounded-[40px] border border-white/5 hover:border-[#E11D48]/30 transition-all group flex items-center gap-6">
                        <div className="w-16 h-16 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center group-hover:bg-[#E11D48]/20 transition-colors"><ShieldCheck className="text-[#E11D48]" size={32} /></div>
                        <div className="text-left"><h3 className="text-xl font-black text-white">SOU GESTOR</h3><p className="text-zinc-500 text-xs">Gerenciar catálogo e pedidos</p></div>
                    </button>

                    <button onClick={() => setAuthFlow('client')} className="w-full glass p-8 rounded-[40px] border border-white/5 hover:border-emerald-500/30 transition-all group flex items-center gap-6">
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors"><ShoppingCart className="text-emerald-500" size={32} /></div>
                        <div className="text-left"><h3 className="text-xl font-black text-white">SOU CLIENTE</h3><p className="text-zinc-500 text-xs">Fazer pedidos</p></div>
                    </button>
                </div>
            ) : (
                <div className={`glass rounded-[40px] border border-white/5 relative overflow-hidden ${authFlow === 'client' && isSigningUp ? 'p-8 max-w-3xl w-[800px] -ml-[180px]' : 'p-10'}`}>
                    <button onClick={() => setAuthFlow('initial')} className="mb-8 text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest relative z-10">← Voltar</button>
                    <h2 className="text-3xl font-black text-white mb-2 uppercase relative z-10">{isSigningUp ? 'Cadastro' : 'Login'}</h2>
                    
                    <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4 relative z-10">
                        {!isSigningUp ? (
                            <>
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            </>
                        ) : (
                            <>
                                {authFlow === 'admin' ? (
                                    <div className="space-y-4">
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="password" placeholder="Chave Mestra" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} />
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="relative"><input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" placeholder="Rede / Franquia *" list="nets" value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})}/><datalist id="nets">{availableNetworks.map(n => <option key={n} value={n}/>)}</datalist></div>
                                            <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" placeholder="Nome da Unidade *" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})}/>
                                        </div>
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" placeholder="CNPJ *" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})}/>
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" placeholder="CEP *" value={formData.cep} onBlur={checkCep} onChange={e => setFormData({...formData, cep: e.target.value})}/>
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="email" placeholder="E-mail *" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                        <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-600 outline-none focus:border-[#E11D48]" type="password" placeholder="Senha *" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                                    </div>
                                )}
                            </>
                        )}
                        <button className="w-full bg-[#E11D48] hover:bg-rose-600 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-colors shadow-lg shadow-rose-900/20">{isSigningUp ? 'Concluir Cadastro' : 'Acessar Painel'}</button>
                    </form>
                    <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-500 text-[10px] font-black uppercase hover:text-white relative z-10">{isSigningUp ? 'Já tenho conta' : 'Criar nova conta'}</button>
                </div>
            )}
        </div>
      </div>
    );
}