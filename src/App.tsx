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
      if (!profile) throw new Error("Perfil não encontrado");
      setCurrentUser({ id: data.user.id, email: data.user.email!, unit_name: profile.unit_name, network_tag: profile.network_tag, role: profile.role });
    } catch (err: any) { showToast(err.message, "error"); } finally { setIsLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    if (authFlow === 'admin' && formData.adminKey !== 'TIQUINHO2026') { setIsLoading(false); return showToast("Chave inválida", "error"); }
    try {
      const { data, error } = await supabase.auth.signUp({ email: formData.email, password: formData.password });
      if (error) throw error;
      if (data.user) {
         // Tabela 'users' - Importante para salvar o cadastro corretamente
         await supabase.from('users').upsert({
            id: data.user.id, email: formData.email, unit_name: formData.unit_name,
            network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag,
            role: authFlow === 'admin' ? 'admin' : 'user',
            cep: formData.cep, address_street: formData.address_street,
            address_city: formData.address_city, contact_name: formData.contact_name,
            phone: formData.phone, cnpj: formData.cnpj
         });
         showToast("Cadastro realizado! Faça login.", "success");
         setIsSigningUp(false);
      }
    } catch (err: any) { showToast(err.message, "error"); } finally { setIsLoading(false); }
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

  // --- ADMIN PANEL ---
  if (currentUser.role === 'admin') {
    const stats = {
      activeModels: products.length,
      revenue: orders.filter(o => o.status !== 'AGUARDANDO VALIDAÇÃO' && o.status !== 'PAGAMENTO RECUSADO').reduce((acc, o) => acc + (o.total_price || 0), 0),
      topNetwork: orders.length > 0 ? orders[0].network_tag : 'N/A',
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.status === 'AGUARDANDO VALIDAÇÃO').length,
      producingOrders: orders.filter(o => o.status === 'PAGO / EM PRODUÇÃO').length,
      readyOrders: orders.filter(o => o.status === 'PEDIDO PRODUZIDO').length,
      refusedOrders: orders.filter(o => o.status === 'PAGAMENTO RECUSADO').length,
    };

    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 p-8">
         <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
         
         <div className="w-full max-w-[96%] mx-auto flex justify-between items-center mb-10 bg-zinc-900/50 backdrop-blur-md p-6 rounded-[32px] border border-white/5 sticky top-6 z-40 shadow-2xl">
            <div className="flex items-center gap-4"><Logo /><h1 className="text-xs font-black uppercase text-zinc-400 tracking-widest">Painel Jéssica</h1></div>
            <button onClick={() => setCurrentUser(null)} className="p-3 bg-zinc-900 rounded-xl text-zinc-500 hover:text-white border border-white/5 transition-colors"><LogOut size={20}/></button>
         </div>

         <div className="w-full max-w-[96%] mx-auto bg-zinc-950 border border-white/5 p-1 rounded-2xl flex gap-1 mb-10 overflow-x-auto">
             {['products', 'pending', 'history', 'users'].map(tab => (
                 <button key={tab} onClick={() => setAdminTab(tab as any)} className={`flex-1 py-4 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === tab ? 'bg-[#E11D48] text-white shadow-lg shadow-rose-900/20' : 'text-zinc-500 hover:bg-zinc-900'}`}>{tab === 'products' ? 'Produtos' : tab === 'pending' ? 'Pendentes' : tab === 'history' ? 'Histórico' : 'Acessos'}</button>
             ))}
         </div>

         <div className="w-full max-w-[96%] mx-auto">
             {adminTab === 'products' && (
                 <>
                    <div className="mb-10"><h3 className="flex items-center gap-2 text-lg font-black uppercase text-white mb-6"><Factory className="text-[#E11D48]" size={20}/> Performance Global</h3>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10 backdrop-blur-sm"><div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-6"><LayoutGrid size={24}/></div><p className="text-[10px] font-black uppercase text-zinc-500 mb-2">Modelos Ativos</p><p className="text-4xl font-black text-white">{stats.activeModels}</p></div>
                           <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10 backdrop-blur-sm"><div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6"><Wallet size={24}/></div><p className="text-[10px] font-black uppercase text-zinc-500 mb-2">Receita Confirmada</p><p className="text-4xl font-black text-white">{formatCurrency(stats.revenue)}</p></div>
                           <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10 backdrop-blur-sm"><div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mb-6"><TrendingUp size={24} /></div><p className="text-[10px] font-black uppercase text-zinc-500 mb-2">Rede Mais Ativa</p><p className="text-2xl font-black text-white">{stats.topNetwork}</p></div>
                       </div>
                    </div>

                    <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-12 mb-12 relative overflow-hidden">
                        <h3 className="flex items-center gap-3 text-2xl font-black uppercase text-white mb-10 relative z-10"><PlusCircle className="text-[#E11D48]" size={28}/> {editingId ? 'Editar Produto' : 'Gerenciar Catálogo'}</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative z-10">
                            <div className="lg:col-span-1">
                                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-4 tracking-widest">Imagem Principal</p>
                                <div onClick={() => fileInputRef.current?.click()} className="h-[400px] bg-zinc-900/50 border-2 border-dashed border-zinc-800 rounded-[32px] flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48] transition-all group relative overflow-hidden mb-4">
                                    {newProduct.image_url ? <img src={newProduct.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> : <><div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mb-6 group-hover:bg-[#E11D48]/20 transition-colors"><ImageIcon className="text-zinc-600 group-hover:text-[#E11D48]" size={32}/></div><span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Upload Imagem</span></>}
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleImageUpload(e, -1)}/>
                                <div className="grid grid-cols-3 gap-3">
                                    {[0, 1, 2].map(idx => (<div key={idx} className="relative aspect-square"><div onClick={() => { if(idx===0)extraFileRef1.current?.click(); if(idx===1)extraFileRef2.current?.click(); if(idx===2)extraFileRef3.current?.click(); }} className="w-full h-full bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center cursor-pointer hover:border-[#E11D48] overflow-hidden group">{newProduct.additional_images?.[idx] ? <img src={newProduct.additional_images[idx]} className="w-full h-full object-cover"/> : <Plus size={16} className="text-zinc-600 group-hover:text-[#E11D48]"/>}</div>{newProduct.additional_images?.[idx] && <button onClick={() => removeAdditionalImage(idx)} className="absolute -top-1 -right-1 bg-rose-600 rounded-full p-1"><X size={10} className="text-white"/></button>}</div>))}
                                    <input type="file" ref={extraFileRef1} className="hidden" onChange={(e) => handleImageUpload(e, 0)}/><input type="file" ref={extraFileRef2} className="hidden" onChange={(e) => handleImageUpload(e, 1)}/><input type="file" ref={extraFileRef3} className="hidden" onChange={(e) => handleImageUpload(e, 2)}/>
                                </div>
                            </div>
                            <div className="lg:col-span-2 space-y-8">
                                <input className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm focus:border-[#E11D48] outline-none" placeholder="Nome do Produto" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                                <textarea className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm h-40 resize-none focus:border-[#E11D48] outline-none" placeholder="Descrição" value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                                <div className="grid grid-cols-2 gap-6"><input type="number" className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm focus:border-[#E11D48] outline-none" placeholder="Preço" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} /><select className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm focus:border-[#E11D48] outline-none" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})}><option>Masculino</option><option>Feminino</option><option>Inverno</option><option>Acessórios</option></select></div>
                                <div className="grid grid-cols-2 gap-6"><input type="number" className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm focus:border-[#E11D48] outline-none" placeholder="Mínimo" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} /><input type="number" className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm focus:border-[#E11D48] outline-none" placeholder="Dias Produção" value={newProduct.production_days} onChange={e => setNewProduct({...newProduct, production_days: e.target.value})} /></div>
                                <div><p className="text-[10px] font-bold uppercase text-zinc-500 mb-3 tracking-widest">Tamanhos</p><div className="flex gap-3">{SIZES_OPTIONS.map(s => (<button key={s} type="button" onClick={() => toggleSize(s)} className={`flex-1 py-4 rounded-2xl text-xs font-black border transition-all ${newProduct.available_sizes.includes(s) ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}>{s}</button>))}</div></div>
                                <div><div onClick={() => toggleNetwork('*')} className={`flex items-center gap-4 p-6 bg-zinc-900 border border-white/5 rounded-2xl cursor-pointer mb-4 ${newProduct.network_tags.includes('*') ? 'border-[#E11D48]' : ''}`}><div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${newProduct.network_tags.includes('*') ? 'bg-white border-white' : 'border-zinc-700'}`}>{newProduct.network_tags.includes('*') && <Check size={20} className="text-black"/>}</div><p className="text-sm font-black text-white uppercase">Todos os Clientes</p></div><div className="space-y-3 mb-8 max-h-60 overflow-y-auto pr-2 custom-scrollbar">{clientProfiles.map(profile => (<div key={profile.id} onClick={() => toggleNetwork(profile.network_tag)} className="flex items-center gap-4 p-4 border border-white/5 bg-zinc-950 rounded-2xl cursor-pointer hover:border-white/20"><div className={`w-6 h-6 rounded-md border flex items-center justify-center ${newProduct.network_tags.includes(profile.network_tag) ? 'bg-white border-white' : 'border-zinc-700'}`}>{newProduct.network_tags.includes(profile.network_tag) && <Check size={14} className="text-black"/>}</div><div><p className="text-xs font-black text-white uppercase">{profile.unit_name}</p><p className="text-[9px] text-zinc-500 uppercase tracking-wider">{profile.network_tag}</p></div></div>))}</div><input className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white text-sm focus:border-[#E11D48] outline-none" placeholder="Rede Manual (ex: nova-rede)" onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); const val = e.currentTarget.value; if(val) toggleNetwork(val); e.currentTarget.value = ''; }}} /></div>
                                <button onClick={handleProductSubmit} className="w-full bg-[#E11D48] hover:bg-rose-600 text-white font-black py-6 rounded-2xl uppercase text-sm tracking-[0.2em] shadow-2xl shadow-rose-900/30 transition-all">{editingId ? 'Atualizar' : 'Publicar'}</button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between mb-8 px-2"><div className="flex items-center gap-3"><Filter size={20} className="text-[#E11D48]"/><h3 className="text-lg font-black uppercase text-white tracking-wide">Catálogo Cadastrado</h3></div><div className="flex gap-2 overflow-x-auto max-w-[600px] pb-2 custom-scrollbar"><button onClick={() => setProductFilter('TODOS')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${productFilter === 'TODOS' ? 'bg-[#E11D48] text-white' : 'bg-zinc-900 text-zinc-500'}`}>TODOS</button>{availableNetworks.map(net => (<button key={net} onClick={() => setProductFilter(net)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${productFilter === net ? 'bg-[#E11D48] text-white' : 'bg-zinc-900 text-zinc-500'}`}>{net}</button>))}</div></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
                        {products.filter(p => productFilter === 'TODOS' || p.network_tag === productFilter).map(p => (
                            <div key={p.id} className="bg-zinc-900/30 border border-white/5 p-6 rounded-[32px] flex items-center gap-6 group hover:border-white/20 transition-all">
                                <img src={p.image_url} className="w-24 h-24 rounded-2xl object-cover bg-zinc-900 shadow-lg"/>
                                <div><h4 className="text-sm font-black text-white uppercase mb-1">{p.name}</h4><p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-4">{p.network_tag}</p><div className="flex gap-3"><button onClick={() => { setEditingId(p.id); setNewProduct({ name: p.name, price: p.price.toString(), description: p.description || '', image_url: p.image_url, additional_images: p.additional_images || [], network_tags: [p.network_tag], category: p.category, min_order: p.min_order.toString(), production_days: p.production_days.toString(), available_sizes: p.available_sizes || [] }); }} className="px-4 py-2 bg-zinc-950 rounded-lg text-[10px] text-zinc-400 hover:text-white font-bold uppercase tracking-wider border border-white/5">Editar</button><button onClick={() => { if(confirm("Deletar?")) { supabase.from('products').delete().eq('id', p.id).then(fetchInitialData); } }} className="px-4 py-2 bg-rose-950/30 rounded-lg text-[10px] text-rose-500 font-bold uppercase tracking-wider border border-rose-500/10">Excluir</button></div></div>
                            </div>
                        ))}
                    </div>
                 </>
             )}

             {adminTab === 'pending' && (
                 <div>
                     <h3 className="flex items-center gap-3 text-2xl font-black uppercase text-white mb-8"><Package className="text-[#E11D48]" size={28}/> Pedidos Pendentes de Validação</h3>
                     {orders.filter(o => o.status === 'AGUARDANDO VALIDAÇÃO').length === 0 ? (
                         <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-24 flex flex-col items-center justify-center opacity-50"><CheckCircle2 size={64} className="text-emerald-500 mb-6"/><p className="text-zinc-500 font-bold uppercase tracking-[0.2em]">Nenhum pedido pendente</p></div>
                     ) : (
                         <div className="grid gap-6">
                             {orders.filter(o => o.status === 'AGUARDANDO VALIDAÇÃO').map(order => (
                                 <div key={order.id} className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10 backdrop-blur-sm">
                                     <div className="flex justify-between items-start mb-8"><div><h4 className="text-2xl font-black text-white uppercase mb-1">{order.unit_name}</h4><p className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div> {new Date(order.created_at).toLocaleDateString()} • {order.user_email}</p></div><p className="text-4xl font-black text-[#E11D48]">{formatCurrency(order.total_price || 0)}</p></div>
                                     <div className="bg-zinc-950/50 p-6 rounded-3xl mb-8 border border-white/5">{order.items.map((it, i) => (<div key={i} className="flex justify-between text-sm text-zinc-400 py-3 border-b border-white/5 last:border-0"><span className="font-medium uppercase tracking-wide">{it.quantity}x {it.name} <span className="text-white font-black">({it.selectedSize})</span></span><span className="font-bold">{formatCurrency(it.price * it.quantity)}</span></div>))}</div>
                                     <div className="flex gap-6"><button onClick={() => handleStatusUpdate(order.id, 'PAGAMENTO RECUSADO')} className="flex-1 py-5 bg-zinc-950 text-rose-500 rounded-2xl font-black uppercase text-xs tracking-[0.2em] border border-white/5 hover:bg-rose-950/30">Recusar</button><button onClick={() => handleStatusUpdate(order.id, 'PAGO / EM PRODUÇÃO')} className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-emerald-500 shadow-lg shadow-emerald-900/20">Confirmar Pagamento</button></div>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
             )}

             {adminTab === 'history' && (
                 <div>
                     <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-10">
                        <div className="bg-zinc-900/40 border border-white/5 rounded-[24px] p-6 flex flex-col justify-between"><span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-4">Total</span><span className="text-3xl font-black text-white">{stats.totalOrders}</span></div>
                        <div className="bg-zinc-900/40 border border-yellow-500/10 rounded-[24px] p-6 flex flex-col justify-between"><span className="text-[10px] font-black uppercase text-yellow-500 tracking-widest mb-4">Pendentes</span><span className="text-3xl font-black text-yellow-500">{stats.pendingOrders}</span></div>
                        <div className="bg-zinc-900/40 border border-blue-500/10 rounded-[24px] p-6 flex flex-col justify-between"><span className="text-[10px] font-black uppercase text-blue-500 tracking-widest mb-4">Produzindo</span><span className="text-3xl font-black text-blue-500">{stats.producingOrders}</span></div>
                        <div className="bg-zinc-900/40 border border-emerald-500/10 rounded-[24px] p-6 flex flex-col justify-between"><span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-4">Prontos</span><span className="text-3xl font-black text-emerald-500">{stats.readyOrders}</span></div>
                        <div className="bg-zinc-900/40 border border-rose-500/10 rounded-[24px] p-6 flex flex-col justify-between"><span className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-4">Recusados</span><span className="text-3xl font-black text-rose-500">{stats.refusedOrders}</span></div>
                        <div className="bg-zinc-900/40 border border-rose-500/10 rounded-[24px] p-6 flex flex-col justify-between"><span className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-4">Receita</span><span className="text-2xl font-black text-[#E11D48]">{formatCurrency(stats.revenue)}</span></div>
                     </div>

                     <div className="flex gap-4 mb-8 overflow-x-auto pb-2">{['TODOS', 'EM PRODUÇÃO', 'PRODUZIDOS', 'RECUSADOS'].map(filter => (<button key={filter} onClick={() => setHistoryFilter(filter)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${historyFilter === filter ? 'bg-[#E11D48] text-white' : 'bg-zinc-900/50 text-zinc-500'}`}>{filter}</button>))}</div>

                     <div className="grid gap-6">
                         {orders.filter(o => { if(historyFilter==='TODOS')return true; if(historyFilter==='EM PRODUÇÃO')return o.status==='PAGO / EM PRODUÇÃO'; if(historyFilter==='PRODUZIDOS')return o.status==='PEDIDO PRODUZIDO'; if(historyFilter==='RECUSADOS')return o.status==='PAGAMENTO RECUSADO'; return true; }).map(order => (
                             <div key={order.id} className="bg-zinc-900/30 border border-white/5 rounded-[32px] p-8">
                                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                                     <div className="flex items-center gap-4 mb-4 md:mb-0"><h3 className="text-xl font-black text-white uppercase tracking-tight">{order.unit_name}</h3><span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg tracking-wider border ${order.status.includes('RECUSADO')?'bg-rose-950/30 border-rose-500/20 text-rose-500':order.status.includes('PRODUZIDO')?'bg-emerald-950/30 border-emerald-500/20 text-emerald-500':order.status.includes('PRODUÇÃO')?'bg-blue-950/30 border-blue-500/20 text-blue-500':'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>{order.status}</span></div>
                                     <div className="text-right"><p className="text-3xl font-black text-[#E11D48] tracking-tighter">{formatCurrency(order.total_price || 0)}</p><p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mt-1">PIX</p></div>
                                 </div>
                                 <div className="space-y-1 mb-8"><p className="text-sm text-zinc-400 font-medium">{order.user_email}</p><p className="text-[10px] text-zinc-600 uppercase font-bold tracking-wider">PEDIDO #{order.id.slice(0,8).toUpperCase()} • {new Date(order.created_at).toLocaleDateString()}</p></div>
                                 <div className="border-t border-white/5 pt-6">
                                     <button onClick={() => setExpandedHistoryOrder(expandedHistoryOrder === order.id ? null : order.id)} className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-white transition-colors">{expandedHistoryOrder === order.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />} VER ITENS</button>
                                     {expandedHistoryOrder === order.id && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 space-y-3">{order.items.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-zinc-950/50 p-4 rounded-xl border border-white/5"><div className="flex items-center gap-4"><img src={item.image_url} className="w-10 h-10 rounded-lg object-cover opacity-60"/><div><p className="text-xs font-black text-white uppercase">{item.name}</p><p className="text-[10px] text-zinc-500 font-bold uppercase">TAM: {item.selectedSize} • QTD: {item.quantity}</p></div></div><p className="text-sm font-black text-zinc-400">{formatCurrency(item.price * item.quantity)}</p></div>))}</motion.div>)}
                                 </div>
                                 {/* Botão de Avanço de Etapa para Admin */}
                                 {order.status === 'PAGO / EM PRODUÇÃO' && (
                                     <div className="mt-6 pt-6 border-t border-white/5">
                                         <button onClick={() => handleStatusUpdate(order.id, 'PEDIDO PRODUZIDO')} className="w-full py-4 bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-600/20">Marcar como Produzido / Pronto</button>
                                     </div>
                                 )}
                             </div>
                         ))}
                     </div>
                 </div>
             )}

             {adminTab === 'users' && (
                 <div>
                     <h3 className="flex items-center gap-3 text-2xl font-black uppercase text-white mb-8"><UsersIcon className="text-[#E11D48]" size={28}/> Controle de Acessos</h3>
                     <div className="space-y-4">
                         {usersList.map((u: any) => (
                             <div key={u.id} className="bg-zinc-900/30 border border-white/5 rounded-[32px] p-6 flex items-center justify-between">
                                 <div className="flex items-center gap-8"><div className="w-16 h-16 bg-rose-900/20 rounded-2xl flex items-center justify-center text-[#E11D48] font-black text-2xl">{u.unit_name?.charAt(0) || 'U'}</div><div><h4 className="text-lg font-black text-white uppercase mb-1">{u.unit_name}</h4><div className="flex gap-3"><span className="bg-zinc-950 border border-white/5 px-3 py-1 rounded-lg text-[10px] text-zinc-500 uppercase font-black tracking-widest">{u.network_tag}</span><span className="bg-zinc-950 border border-white/5 px-3 py-1 rounded-lg text-[10px] text-zinc-500 uppercase font-black tracking-widest">{u.email}</span></div></div></div>
                                 <div className="flex items-center gap-6"><span className="bg-emerald-900/20 text-emerald-500 border border-emerald-500/20 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.15em]">{u.role === 'admin' ? 'GESTOR' : 'FRANQUEADO'}</span><button onClick={() => handleDeleteUser(u.id)} className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-600 hover:text-rose-500 border border-white/5"><Trash2 size={20} /></button></div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
         </div>
      </div>
    );
  }

  // --- CLIENT PANEL ---
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-['Inter']">
       <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
       
       <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5">
           <div className="w-full max-w-[96%] mx-auto px-6 py-5 flex justify-between items-center">
               <div className="flex items-center gap-6"><Logo /><div className="bg-zinc-900/50 border border-white/10 rounded-full px-5 py-2 flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">{currentUser.network_tag.toUpperCase()} <span className="text-zinc-600 mx-2">/</span> {currentUser.unit_name.toUpperCase()}</span></div></div>
               <div className="flex items-center gap-6 text-zinc-400">
                   <div className="relative">
                       <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="hover:text-white transition-colors relative"><Bell size={20}/>{orders.length > 0 && !orders[0].status.includes('VALIDAÇÃO') && <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full"></span>}</button>
                       <AnimatePresence>{isNotificationsOpen && (<motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: 10}} className="absolute top-12 right-0 w-80 bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl p-6 z-50"><h3 className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest mb-4">Notificações</h3>{orders.slice(0,3).map(o => (<div key={o.id} className="flex items-start gap-4 p-4 bg-zinc-900/50 rounded-xl border border-white/5 mb-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center ${o.status.includes('PRODUZIDO') ? 'bg-emerald-500/10 text-emerald-500' : o.status.includes('PRODUÇÃO') ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-800 text-zinc-500'}`}>{o.status.includes('PRODUZIDO') ? <CheckCircle2 size={16}/> : <Clock size={16}/>}</div><div><p className="text-sm font-bold text-white mb-1">Pedido #{o.id.slice(0,4).toUpperCase()}</p><p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{o.status}</p></div></div>))}{orders.length === 0 && <p className="text-zinc-500 text-xs text-center py-4">Nenhuma notificação</p>}</motion.div>)}</AnimatePresence>
                   </div>
                   <button onClick={() => setIsHistoryModalOpen(true)} className="hover:text-white transition-colors"><List size={20}/></button>
                   <button onClick={() => setIsCartOpen(true)} className="relative hover:text-white transition-colors"><ShoppingCart size={20}/>{cart.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E11D48] rounded-full text-[9px] flex items-center justify-center font-bold text-white shadow-lg shadow-rose-900">{cart.length}</span>}</button>
                   <button onClick={() => setCurrentUser(null)} className="hover:text-white transition-colors"><LogOut size={20}/></button>
               </div>
           </div>
       </header>

       <main className="w-full max-w-[96%] mx-auto px-6 py-16">
           <div className="mb-12 mt-4"><h1 className="text-4xl font-black uppercase text-white tracking-tight mb-2">Catálogo Oficial</h1><p className="text-[11px] font-bold uppercase text-zinc-500 tracking-[0.3em]">Selecione os uniformes para sua unidade</p></div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-8 mb-24">
               {products.filter(p => p.network_tag === '*' || p.network_tag === currentUser.network_tag).map(p => (
                   <div key={p.id} className="group relative bg-zinc-950 rounded-[32px] overflow-hidden border border-white/5 hover:border-white/20 transition-all duration-300">
                       <div className="h-[320px] relative"><img src={p.image_url} className="w-full h-full object-cover"/><div className="absolute top-4 right-4 bg-zinc-900/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10"><span className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2"><Tag size={10} className="text-[#E11D48]"/> {p.category}</span></div></div>
                       <div className="p-6 bg-zinc-950 border-t border-white/5 relative"><h3 className="text-sm font-black text-white uppercase mb-1 tracking-wide">{p.name}</h3><p className="text-xl font-black text-[#E11D48]">{formatCurrency(p.price)}</p><div className="absolute inset-0 bg-zinc-950/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"><button onClick={() => { setDetailsModalOpenId(p.id); setActiveModalImage(p.image_url); }} className="bg-white text-black px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-transform">Ver Detalhes</button></div></div>
                   </div>
               ))}
           </div>
           <div><h2 className="text-3xl font-black uppercase text-white mb-10 pl-4 border-l-4 border-[#E11D48]">Meus Pedidos Recentes</h2><div className="space-y-6">{orders.slice(0,3).map(o => (<div key={o.id} className="bg-zinc-900 border border-white/5 rounded-[40px] p-10 flex items-center justify-between group hover:border-white/10 transition-colors hover:bg-zinc-900/80"><div><p className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">Pedido #{o.id.slice(0,8)}</p><div className="flex items-center gap-4"><p className="text-white font-black text-lg">{o.items.length} Item(s)</p><div className="h-1 w-1 bg-zinc-700 rounded-full"></div><span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${o.status.includes('PRODUZIDO') ? 'bg-emerald-500/20 text-emerald-500' : o.status.includes('PRODUÇÃO') ? 'bg-blue-500/20 text-blue-500' : 'bg-yellow-500/20 text-yellow-500'}`}>{o.status}</span></div></div><p className="text-4xl font-black text-[#E11D48]">{formatCurrency(o.total_price || 0)}</p></div>))}</div></div>
       </main>

       <a href="https://wa.me/551732167854" target="_blank" className="fixed bottom-6 right-6 z-[100] w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 hover:scale-110 transition-transform hover:bg-emerald-400"><MessageCircle size={28} /></a>

       <AnimatePresence>{isHistoryModalOpen && (<div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6 backdrop-blur-md"><motion.div initial={{scale: 0.95, opacity: 0}} animate={{scale: 1, opacity: 1}} exit={{scale: 0.95, opacity: 0}} className="bg-zinc-950 border border-white/10 rounded-[40px] max-w-2xl w-full p-8 relative overflow-hidden flex flex-col max-h-[85vh]"><div className="flex justify-between items-center mb-8"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-[#E11D48]/20 rounded-xl flex items-center justify-center text-[#E11D48]"><History size={20}/></div><h2 className="text-2xl font-black uppercase text-white tracking-tight">Meu Histórico</h2></div><button onClick={() => setIsHistoryModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors"><X/></button></div><div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">{orders.map(order => (<div key={order.id} className="bg-zinc-900 border border-white/5 rounded-3xl p-6"><div className="flex justify-between items-center mb-6 pb-6 border-b border-white/5"><div><p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">ID</p><p className="text-sm font-black text-white">#{order.id.slice(0,8).toUpperCase()}</p></div><div className="text-right"><p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Data</p><p className="text-sm font-black text-white">{new Date(order.created_at).toLocaleDateString()}</p></div></div><div className="space-y-3 mb-6">{order.items.map((item, i) => (<div key={i} className="flex justify-between text-xs"><span className="text-zinc-300 font-bold"><span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 mr-2">{item.quantity}x</span> {item.name} ({item.selectedSize})</span><span className="text-zinc-500">{formatCurrency(item.price * item.quantity)}</span></div>))}</div><div className="flex justify-between items-center pt-4 border-t border-white/5"><span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${order.status.includes('PRODUZIDO') ? 'text-yellow-500 border-yellow-500/20 bg-yellow-500/10' : order.status.includes('PRODUÇÃO') ? 'text-blue-500 border-blue-500/20 bg-blue-500/10' : 'text-zinc-500 border-zinc-700 bg-zinc-800'}`}>{order.status}</span><span className="text-xl font-black text-[#E11D48]">{formatCurrency(order.total_price || 0)}</span></div></div>))}</div><div className="mt-6 pt-6 border-t border-white/10"><button onClick={() => setIsHistoryModalOpen(false)} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-colors">Voltar</button></div></motion.div></div>)}</AnimatePresence>

       <AnimatePresence>{detailsModalOpenId && (() => { const p = products.find(prod => prod.id === detailsModalOpenId); if(!p) return null; const selectedSize = clientSelectedSizes[p.id]; const allImages = [p.image_url, ...(p.additional_images || [])].filter(Boolean); return (<div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"><motion.div initial={{y: 100, opacity: 0}} animate={{y: 0, opacity: 1}} exit={{y: 100, opacity: 0}} className="bg-zinc-950 border border-white/10 rounded-[48px] max-w-5xl w-full overflow-hidden flex flex-col md:flex-row shadow-2xl shadow-black"><div className="md:w-1/2 h-[600px] md:h-auto bg-zinc-900 relative flex flex-col"><div className="flex-1 relative"><img src={activeModalImage || p.image_url} className="w-full h-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-50 pointer-events-none"></div></div>{allImages.length > 1 && (<div className="p-4 grid grid-cols-4 gap-3 bg-zinc-950/50 backdrop-blur-md absolute bottom-0 w-full">{allImages.map((img, idx) => (<div key={idx} onClick={() => setActiveModalImage(img)} className={`aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${activeModalImage === img ? 'border-[#E11D48] scale-105' : 'border-transparent opacity-70 hover:opacity-100'}`}><img src={img} className="w-full h-full object-cover"/></div>))}</div>)}</div><div className="md:w-1/2 p-12 md:p-16 flex flex-col justify-between overflow-y-auto max-h-[90vh] custom-scrollbar"><div><div className="flex justify-between items-start mb-10"><div><h2 className="text-3xl font-black text-white uppercase mb-4 leading-tight">{p.name}</h2><p className="text-4xl font-black text-[#E11D48]">{formatCurrency(p.price)}</p></div><button onClick={() => setDetailsModalOpenId(null)} className="p-4 bg-zinc-900 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"><X/></button></div><div className="mb-8"><p className="text-[10px] font-bold uppercase text-zinc-500 mb-2 tracking-[0.2em]">Sobre o Produto</p><p className="text-zinc-400 text-sm leading-relaxed mb-6">{p.description || "Sem descrição disponível."}</p><div className="flex gap-4"><div className="flex items-center gap-3 bg-zinc-900 px-4 py-3 rounded-xl border border-white/5"><Clock size={16} className="text-[#E11D48]"/><div><p className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider">Prazo de Produção</p><p className="text-xs font-black text-white">{p.production_days} Dias Úteis</p></div></div><div className="flex items-center gap-3 bg-zinc-900 px-4 py-3 rounded-xl border border-white/5"><Package size={16} className="text-[#E11D48]"/><div><p className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider">Pedido Mínimo</p><p className="text-xs font-black text-white">{p.min_order} Unidades</p></div></div></div></div><div className="mb-10"><p className="text-[10px] font-bold uppercase text-zinc-500 mb-4 tracking-[0.2em]">Selecione o Tamanho</p><div className="flex flex-wrap gap-3">{(p.available_sizes || []).map((s: string) => (<button key={s} onClick={() => setClientSelectedSizes({...clientSelectedSizes, [p.id]: s as Size})} className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-black transition-all ${selectedSize === s ? 'bg-[#E11D48] text-white shadow-lg shadow-rose-900/40 scale-110' : 'bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800'}`}>{s}</button>))}</div></div></div><div><button onClick={() => { if(!selectedSize) return showToast("Selecione um tamanho", "error"); setCart([...cart, {...p, selectedSize, quantity: p.min_order}]); setDetailsModalOpenId(null); showToast("Adicionado ao carrinho"); }} className="w-full bg-white text-black py-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-zinc-200 transition-transform hover:scale-[1.02]">Adicionar ao Pedido ({p.min_order} UN)</button><p className="text-center text-[10px] text-zinc-600 mt-4 font-bold uppercase tracking-[0.2em]">Pedido Mínimo Obrigatório</p></div></div></motion.div></div>); })()}</AnimatePresence>

       <AnimatePresence>{isCartOpen && (<motion.div initial={{x: '100%'}} animate={{x: 0}} exit={{x: '100%'}} className="fixed top-0 right-0 h-full w-full max-w-md bg-[#09090b] z-[150] flex flex-col shadow-2xl shadow-black/80"><div className="p-8 flex justify-between items-center"><h2 className="text-3xl font-black uppercase text-white tracking-wide">MINHA LISTA</h2><button onClick={() => setIsCartOpen(false)}><X className="text-zinc-500 hover:text-white transition-colors" size={24}/></button></div><div className="flex-1 overflow-y-auto px-8 space-y-4">{cart.length === 0 && (<div className="flex flex-col items-center justify-center h-full opacity-30"><ShoppingCart size={48} className="mb-4"/><p className="text-center text-zinc-400 uppercase text-xs font-black tracking-[0.2em]">Carrinho Vazio</p></div>)}{cart.map((item, idx) => (<div key={idx} className="relative bg-zinc-900 p-4 rounded-3xl flex gap-4 border border-white/5 items-center"><button onClick={() => { const n = [...cart]; n.splice(idx, 1); setCart(n); }} className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors"><X size={16}/></button><img src={item.image_url} className="w-24 h-24 rounded-2xl object-cover bg-zinc-950"/><div className="flex-1 pr-6"><h4 className="text-xs font-black text-white uppercase mb-1 leading-tight tracking-wide">{item.name}</h4><p className="text-[10px] text-zinc-500 uppercase font-bold mb-3 tracking-wider">TAM: {item.selectedSize}</p><div className="flex items-center gap-3"><button onClick={() => { const n = [...cart]; n[idx].quantity--; n[idx].quantity < item.min_order ? setCart(cart.filter((_,i)=>i!==idx)) : setCart(n); }} className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors"><Minus size={14}/></button><span className="text-lg font-black text-[#E11D48] w-6 text-center">{item.quantity}</span><button onClick={() => { const n = [...cart]; n[idx].quantity++; setCart(n); }} className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors"><Plus size={14}/></button></div></div></div>))}</div><div className="p-8 mt-auto"><div className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5 mb-6"><label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-3 block">FRETE (CEP)</label><div className="flex gap-3"><input placeholder="00000-000" value={cep} onChange={e => setCep(e.target.value)} className="flex-1 bg-zinc-950 border border-white/10 rounded-2xl px-6 py-4 text-white text-sm outline-none focus:border-[#E11D48] tracking-widest placeholder:text-zinc-600"/><button onClick={calculateShipping} className="bg-[#E11D48] px-6 rounded-2xl text-xs font-black uppercase tracking-widest text-white hover:bg-rose-600 transition-colors">OK</button></div></div><div className="flex justify-between items-end mb-8 px-2"><span className="text-sm font-black text-white uppercase tracking-widest">TOTAL</span><span className="text-3xl font-black text-[#E11D48] tracking-tight">{formatCurrency(cart.reduce((a,b)=>a+b.price*b.quantity,0) + (shippingCost || 0))}</span></div><div className="space-y-4"><button onClick={() => { if(shippingCost===null) return showToast("Calcule o frete", "error"); setIsCartOpen(false); setIsPaymentOpen(true); }} className="w-full bg-[#E11D48] hover:bg-rose-600 text-white py-5 rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-rose-900/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-3"><QrCode size={18}/> PAGAR PIX</button><button onClick={handleWhatsAppQuote} className="w-full bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-[0.15em] transition-all hover:border-white/20">ORÇAMENTO / DÚVIDAS VIA WHATSAPP</button></div></div></motion.div>)}</AnimatePresence>

       {isPaymentOpen && (<div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-6 backdrop-blur-xl"><div className="bg-zinc-950 border border-white/10 rounded-[48px] max-w-md w-full p-12 text-center relative overflow-hidden shadow-2xl"><div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#E11D48] via-purple-500 to-indigo-500"></div><QrCode size={64} className="text-[#E11D48] mx-auto mb-8 drop-shadow-[0_0_15px_rgba(225,29,72,0.5)]"/><h2 className="text-3xl font-black uppercase text-white mb-3">Pagamento PIX</h2><p className="text-zinc-500 text-xs mb-10 font-bold uppercase tracking-widest">Escaneie o QR Code abaixo para concluir</p><div className="bg-white p-6 rounded-[32px] mb-10 mx-auto w-fit shadow-xl"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getPixCode())}`} className="w-48 h-48"/></div><button onClick={() => { navigator.clipboard.writeText(getPixCode()); showToast("Copiado!"); }} className="w-full bg-zinc-900 text-zinc-300 py-5 rounded-2xl font-bold uppercase text-xs tracking-[0.15em] hover:text-white mb-4 flex items-center justify-center gap-3 border border-white/5 hover:bg-zinc-800 transition-colors"><Copy size={16}/> Copiar Código Pix</button><button onClick={handleFinalize} className="w-full bg-[#E11D48] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.15em] hover:bg-rose-600 shadow-lg shadow-rose-900/30 transition-transform hover:scale-[1.02]">Confirmar Pagamento</button><button onClick={() => setIsPaymentOpen(false)} className="mt-8 text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-colors">Cancelar Operação</button></div></div>)}

       {isOrderSuccessOpen && (<div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6 backdrop-blur-md"><motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="bg-zinc-950 border border-[#E11D48]/30 rounded-[56px] max-w-md w-full p-16 text-center relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-b from-[#E11D48]/10 to-transparent pointer-events-none"></div><div className="w-24 h-24 bg-[#E11D48] rounded-full flex items-center justify-center mx-auto mb-8 text-white shadow-2xl shadow-rose-500/50"><CheckCircle2 size={48}/></div><h2 className="text-3xl font-black uppercase text-white mb-6">Pedido Recebido!</h2><p className="text-zinc-500 text-sm mb-10 leading-relaxed font-medium">Seu pedido foi enviado para validação da central. Você será notificado assim que a produção iniciar.</p><button onClick={() => setIsOrderSuccessOpen(false)} className="w-full bg-white text-black py-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-zinc-200 transition-transform hover:scale-[1.02] shadow-xl">Voltar a Loja</button></motion.div></div>)}
    </div>
  );
}