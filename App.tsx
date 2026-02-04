import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, 
  ShieldCheck, Package, Trash2, Image as ImageIcon, QrCode, Minus, Copy, 
  Search, Factory, Users as UsersIcon, Bell, 
  LayoutGrid, List, History, Wallet, TrendingUp, PlusCircle, Tag, Check, ChevronDown, ChevronRight, Clock, MessageCircle, Filter, MapPin, Phone, Building2, Mail, User as UserIcon, Edit,
  LogOut as LogoutIcon, List as ListIcon, FileText
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
    this.merchantName = this.normalizeString(name || '', 25); 
    this.merchantCity = this.normalizeString(city || '', 15); 
    this.amount = amount.toFixed(2);
    this.txId = this.normalizeString(txId || '***', 25);
  }

  private normalizeString(str: string, limit: number): string {
    if (!str) return ""; 
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
const Logo = ({ className = "h-12 w-auto" }: { className?: string }) => (
  <img 
    src="https://i.imgur.com/dtOfmhg.png" 
    alt="Tiquinho Uniformes" 
    className={`${className} object-contain`}
  />
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
  // --- STATES ---
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isOrderSuccessOpen, setIsOrderSuccessOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // New State for History Modal
  const [detailsModalOpenId, setDetailsModalOpenId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);
  const [cep, setCep] = useState('');
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [loading, setLoading] = useState(true);
  const [authFlow, setAuthFlow] = useState<'initial' | 'admin' | 'client'>('initial');
  const [isSigningUp, setIsSigningUp] = useState(false);
  
  // Forms & Inputs
  const [formData, setFormData] = useState({ 
    email: '', password: '', unit_name: '', network_tag: '', role: 'user' as 'user' | 'admin', 
    adminKey: '', cnpj: '', phone: '', contact_name: '', cep: '', 
    address_street: '', address_city: '', address_state: ''
  });

  // Admin States
  const [adminTab, setAdminTab] = useState<'products' | 'pending' | 'history' | 'users'>('products');
  const [productFilter, setProductFilter] = useState('TODOS');
  const [historySubFilter, setHistorySubFilter] = useState('TODOS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', price: '', image_url: '', additional_images: [] as string[], network_tags: [] as string[], 
    category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] as Size[]
  });
  const [selectedUserForModal, setSelectedUserForModal] = useState<any | null>(null); // New state for User Details Modal
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<OrderDB | null>(null); // New state for Order Items Modal
  const [activeStatusDropdownId, setActiveStatusDropdownId] = useState<string | null>(null); // State for editable status dropdown
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderDB[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);

  const SIZES_OPTIONS: Size[] = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'G1', 'G2', 'Único'];

  // --- HELPERS ---
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', { 
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    }).toUpperCase();
  };

  const calculateShipping = async () => {
    if (cep.length !== 8) return showToast("CEP inválido", "error");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) throw new Error();
      setShippingCost(data.uf === 'SP' ? 25.90 : 78.50);
      showToast(`Frete calculado: ${formatCurrency(data.uf === 'SP' ? 25.90 : 78.50)}`);
    } catch { showToast("Erro no CEP", "error"); }
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

  // --- AUTH ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: formData.email, password: formData.password });
      if (error) throw error;
      const { data: profile, error: profileError } = await supabase.from('users').select('*').eq('id', data.user.id).single();
      if (!profile || profileError) throw new Error("Perfil não encontrado.");
      setCurrentUser({ id: data.user.id, email: data.user.email!, unit_name: profile.unit_name || '', network_tag: profile.network_tag || '', role: profile.role || 'user' });
      showToast('Login realizado com sucesso!');
    } catch (err: any) { showToast(err.message, "error"); } finally { setLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    if (authFlow === 'admin' && formData.adminKey !== 'TIQUINHO2026') { setLoading(false); return showToast("Chave inválida", "error"); }
    try {
      const { data, error } = await supabase.auth.signUp({ 
          email: formData.email, password: formData.password,
          options: { data: { unit_name: formData.unit_name, network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag, role: authFlow === 'admin' ? 'admin' : 'user', cnpj: formData.cnpj, phone: formData.phone, contact_name: formData.contact_name, cep: formData.cep, address_street: formData.address_street, address_city: formData.address_city, address_state: formData.address_state } }
      });
      if (error) throw error;
      if (data.user) {
         await supabase.from('users').upsert({ id: data.user.id, email: formData.email, unit_name: formData.unit_name, network_tag: authFlow === 'admin' ? 'admin' : formData.network_tag, role: authFlow === 'admin' ? 'admin' : 'user', cnpj: formData.cnpj, phone: formData.phone, contact_name: formData.contact_name, cep: formData.cep, address_street: formData.address_street, address_city: formData.address_city, address_state: formData.address_state });
         setCurrentUser({ id: data.user.id, email: formData.email, unit_name: formData.unit_name || '', network_tag: authFlow === 'admin' ? 'admin' : (formData.network_tag || ''), role: authFlow === 'admin' ? 'admin' : 'user' });
         showToast("Cadastro realizado!", "success"); setIsSigningUp(false);
      }
    } catch (err: any) { showToast(err.message, "error"); } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCart([]);
    setIsCartOpen(false);
    showToast('Logout realizado');
  };

  // --- DATA FETCHING & ACTIONS ---
  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    setProducts(data || []);
  };

  const fetchOrders = async () => {
      if (!currentUser) return;
      let orderQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (currentUser.role !== 'admin') orderQuery = orderQuery.eq('user_id', currentUser.id);
      const { data: orderData } = await orderQuery;
      if (orderData) setOrders(orderData);
  };

  const fetchInitialData = async () => {
    if (!currentUser) return;
    await fetchProducts();
    await fetchOrders();
    if (currentUser.role === 'admin') {
      const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (users) {
        setUsersList(users);
        setAvailableNetworks([...new Set(users.filter(u => u.role !== 'admin').map((u: any) => u.network_tag))] as string[]);
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        if (profile) setCurrentUser({ id: session.user.id, email: session.user.email!, unit_name: profile.unit_name || '', network_tag: profile.network_tag || '', role: profile.role || 'user' });
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => { if (currentUser) fetchInitialData(); }, [currentUser]);

  // --- ADMIN ACTIONS ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
          const result = reader.result as string;
          if (index === -1) setNewProduct({...newProduct, image_url: result});
          else {
              const currentImages = [...(newProduct.additional_images || [])];
              while(currentImages.length <= index) currentImages.push('');
              currentImages[index] = result;
              setNewProduct({...newProduct, additional_images: currentImages});
          }
      };
      reader.readAsDataURL(file);
  };

  const handleProductSubmit = async () => {
    let targetTags = newProduct.network_tags; 
    if (targetTags.length === 0) return showToast("Selecione pelo menos uma rede ou 'Todos'", "error");
    setLoading(true);
    try {
        const prods = targetTags.map(tag => ({
            name: newProduct.name, description: newProduct.description, price: parseFloat(newProduct.price), 
            image_url: newProduct.image_url, additional_images: newProduct.additional_images, network_tag: tag, category: newProduct.category, 
            min_order: parseInt(newProduct.min_order), production_days: parseInt(newProduct.production_days), 
            available_sizes: newProduct.available_sizes
        }));
        if (editingId) await supabase.from('products').delete().eq('id', editingId);
        const { error } = await supabase.from('products').insert(prods);
        if (error) throw error;
        showToast("Produto salvo!"); await fetchProducts(); setEditingId(null);
        setNewProduct({ name: '', price: '', image_url: '', additional_images: [], network_tags: [], category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] });
    } catch (e: any) { showToast(e.message, 'error'); } finally { setLoading(false); }
  };

  const handleEditProduct = (product: Product) => {
      setEditingId(product.id);
      setNewProduct({
          name: product.name,
          price: product.price.toString(),
          image_url: product.image_url,
          additional_images: product.additional_images || [],
          network_tags: [product.network_tag],
          category: product.category,
          description: product.description || '',
          min_order: product.min_order.toString(),
          production_days: product.production_days.toString(),
          available_sizes: product.available_sizes || []
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Excluir este produto?')) return;
    try {
      setLoading(true);
      await supabase.from('products').delete().eq('id', productId);
      await fetchProducts();
      showToast('Produto excluído!');
    } catch (error: any) { showToast(error.message, 'error'); } finally { setLoading(false); }
  };

  const handleDeleteUser = async (userId: string) => {
      if (!window.confirm("Tem certeza que deseja excluir este usuário? Essa ação não pode ser desfeita.")) return;
      setLoading(true);
      try {
          const { error } = await supabase.from('users').delete().eq('id', userId);
          if (error) throw error;
          showToast("Usuário removido com sucesso!");
          setUsersList(prev => prev.filter(u => u.id !== userId));
      } catch (error: any) {
          showToast("Erro ao excluir: " + error.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
      setLoading(true);
      try {
        await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
        showToast(`Status atualizado para: ${newStatus}`);
        setActiveStatusDropdownId(null); // Close dropdown if open
        await fetchOrders(); 
      } catch (e: any) { showToast(e.message, 'error'); } finally { setLoading(false); }
  };

  // --- CART ACTIONS ---
  const handleFinalize = async () => {
      if (cart.length === 0) return showToast("Carrinho vazio", "error");
      if (!shippingCost) return showToast("Calcule o frete", "error");
      setLoading(true);
      try {
        const total = cart.reduce((a, b) => a + b.price * b.quantity, 0) + (shippingCost || 0);
        await supabase.from('orders').insert({
            user_id: currentUser!.id, user_email: currentUser!.email, unit_name: currentUser!.unit_name,
            items: cart, total_price: total, status: 'AGUARDANDO VALIDAÇÃO', payment_method: 'PIX', network_tag: currentUser!.network_tag
        });
        setCart([]); setIsCartOpen(false); setIsPaymentOpen(false); setIsOrderSuccessOpen(true); await fetchOrders();
      } catch (e: any) { showToast(e.message, 'error'); } finally { setLoading(false); }
  };

  if (loading) return <Spinner />;

  // --- LOGIN SCREEN ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6">
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <div className="w-full max-w-md">
            {authFlow === 'initial' ? (
                <div className="flex flex-col items-center gap-6">
                    <img src="https://i.imgur.com/dtOfmhg.png" alt="Logo" className="h-48 w-auto mb-2 drop-shadow-2xl"/>
                    <div className="text-center mb-10">
                        <h2 className="text-sm font-bold tracking-[0.4em] text-zinc-500 uppercase mb-2">Tiquinho Corporate</h2>
                        <p className="text-zinc-400 text-xs tracking-wide">Plataforma de Uniformes Corporativos</p>
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
                <div className={`glass rounded-[40px] border border-white/5 p-10 relative overflow-hidden`}>
                    <button onClick={() => setAuthFlow('initial')} className="mb-8 text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest">← Voltar</button>
                    <h2 className="text-3xl font-black text-white mb-6 uppercase">{isSigningUp ? 'Cadastro' : 'Login'}</h2>
                    <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
                        {!isSigningUp ? (
                            <>
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            </>
                        ) : (
                            <div className="space-y-4">
                                {authFlow === 'admin' && <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" type="password" placeholder="Chave Mestra" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} />}
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" placeholder="Rede / Franquia *" value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})}/>
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" placeholder="Nome da Unidade *" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})}/>
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" type="email" placeholder="E-mail *" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                <input className="w-full bg-zinc-950/50 border border-white/10 rounded-2xl p-4 text-white" type="password" placeholder="Senha *" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            </div>
                        )}
                        <button className="w-full bg-[#E11D48] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest">{isSigningUp ? 'Concluir Cadastro' : 'Acessar'}</button>
                    </form>
                    <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-500 text-[10px] font-black uppercase">{isSigningUp ? 'Já tenho conta' : 'Criar nova conta'}</button>
                </div>
            )}
        </div>
      </div>
    );
  }

  // --- ADMIN PANEL ---
  if (currentUser.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 p-8">
         <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
         
         {/* Admin Header */}
         <div className="w-full max-w-[96%] mx-auto flex justify-between items-center mb-10 bg-zinc-900/50 p-6 rounded-[32px] border border-white/5 sticky top-6 z-40 backdrop-blur-md">
            <div className="flex items-center gap-4"><Logo /><h1 className="text-xs font-black uppercase text-zinc-400 tracking-widest">Painel Gestor</h1></div>
            <button onClick={handleLogout} className="p-3 bg-zinc-900 rounded-xl text-zinc-500 hover:text-white border border-white/5"><LogOut size={20}/></button>
         </div>

         {/* Admin Tabs */}
         <div className="w-full max-w-[96%] mx-auto bg-zinc-950 border border-white/5 p-1 rounded-2xl flex gap-1 mb-10">
             {[
               { id: 'products', label: 'PRODUTOS' },
               { id: 'pending', label: 'PENDENTES' },
               { id: 'history', label: 'ACESSOS' }, // Renomeado conforme solicitação do layout
               { id: 'users', label: 'USUÁRIOS' }
             ].map(tab => (
                 <button key={tab.id} onClick={() => setAdminTab(tab.id as any)} className={`flex-1 py-4 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${adminTab === tab.id ? 'bg-[#E11D48] text-white' : 'text-zinc-500 hover:bg-zinc-900'}`}>{tab.label}</button>
             ))}
         </div>

         <div className="w-full max-w-[96%] mx-auto">
             {/* PERFORMANCE GLOBAL (DASHBOARD) - SHOWN IN PRODUCTS TAB OR SEPARATE? USER SCREENSHOT SHOWS IT ABOVE */}
             {adminTab === 'products' && (
                <>
                 <div className="mb-10 flex items-center gap-3"><TrendingUp className="text-[#E11D48]"/><h2 className="text-xl font-black uppercase text-white">Performance Global</h2></div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                     <div className="bg-zinc-950 border border-white/5 p-8 rounded-[32px]">
                         <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6"><LayoutGrid className="text-blue-500"/></div>
                         <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Modelos Ativos</p>
                         <h3 className="text-4xl font-black text-white">{products.length}</h3>
                     </div>
                     <div className="bg-zinc-950 border border-white/5 p-8 rounded-[32px]">
                         <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6"><Wallet className="text-emerald-500"/></div>
                         <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Receita Confirmada</p>
                         <h3 className="text-4xl font-black text-white">{formatCurrency(orders.filter(o => o.status === 'PAGO / EM PRODUÇÃO' || o.status === 'PEDIDO PRODUZIDO').reduce((acc, curr) => acc + curr.total_price, 0))}</h3>
                     </div>
                     <div className="bg-zinc-950 border border-white/5 p-8 rounded-[32px]">
                         <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6"><TrendingUp className="text-rose-500"/></div>
                         <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Pedidos Totais</p>
                         <h3 className="text-4xl font-black text-white">{orders.length}</h3>
                     </div>
                 </div>

                 {/* ADD PRODUCT FORM */}
                 <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-12 mb-12">
                    <h3 className="flex items-center gap-3 text-2xl font-black uppercase text-white mb-10"><PlusCircle className="text-[#E11D48]"/> {editingId ? 'Editar Uniforme' : 'Gerenciar Catálogo'}</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                        <div className="lg:col-span-1">
                            <p className="text-[10px] font-bold uppercase text-zinc-500 mb-4">Imagem Principal</p>
                            <div onClick={() => fileInputRef.current?.click()} className="h-[400px] bg-zinc-900/50 border-2 border-dashed border-zinc-800 rounded-[32px] flex flex-col items-center justify-center cursor-pointer overflow-hidden hover:border-[#E11D48] transition-colors group">
                                {newProduct.image_url ? <img src={newProduct.image_url} className="w-full h-full object-cover"/> : <div className="flex flex-col items-center gap-4"><ImageIcon size={32} className="text-zinc-600 group-hover:text-[#E11D48]"/><span className="text-[10px] font-bold uppercase text-zinc-600">Upload Imagem</span></div>}
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleImageUpload(e, -1)}/>
                            
                            <div className="mt-6">
                                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-4">Fotos Extras (Máx 3)</p>
                                <div className="grid grid-cols-3 gap-4">
                                    {[0,1,2].map(idx => (
                                        <div key={idx} className="aspect-square bg-zinc-900 rounded-2xl border border-white/5 flex items-center justify-center cursor-pointer overflow-hidden relative group">
                                            {newProduct.additional_images?.[idx] ? (
                                                <>
                                                 <img src={newProduct.additional_images[idx]} className="w-full h-full object-cover"/>
                                                 <button onClick={(e)=>{e.stopPropagation(); const imgs = [...(newProduct.additional_images||[])]; imgs.splice(idx,1); setNewProduct({...newProduct, additional_images: imgs})}} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Trash2 className="text-white" size={16}/></button>
                                                </>
                                            ) : (
                                                <label className="w-full h-full flex items-center justify-center cursor-pointer">
                                                    <Plus size={16} className="text-zinc-600"/>
                                                    <input type="file" className="hidden" onChange={(e)=>handleImageUpload(e, idx)}/>
                                                </label>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2 space-y-6">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Nome do Uniforme</label>
                                <input className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white outline-none focus:border-[#E11D48]" placeholder="Ex: Camiseta Polo Branca" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Descrição Detalhada</label>
                                <textarea className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white h-40 outline-none focus:border-[#E11D48]" placeholder="Detalhes sobre tecido, gola, acabamento..." value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Preço Unitário (R$)</label>
                                    <input type="number" className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white outline-none focus:border-[#E11D48]" placeholder="0.00" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Categoria</label>
                                    <select className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white outline-none focus:border-[#E11D48]" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})}>
                                        <option>Masculino</option><option>Feminino</option><option>Inverno</option><option>Acessórios</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Pedido Mínimo (UN)</label>
                                    <input type="number" className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white outline-none focus:border-[#E11D48]" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Prazo Produção (Dias)</label>
                                    <input type="number" className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-6 text-white outline-none focus:border-[#E11D48]" value={newProduct.production_days} onChange={e => setNewProduct({...newProduct, production_days: e.target.value})} />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Tamanhos Disponíveis</label>
                                <div className="flex flex-wrap gap-2">
                                    {SIZES_OPTIONS.map(size => (
                                        <button key={size} onClick={() => {
                                            const current = newProduct.available_sizes || [];
                                            setNewProduct({...newProduct, available_sizes: current.includes(size) ? current.filter(s => s !== size) : [...current, size]})
                                        }} className={`px-4 py-3 rounded-xl text-xs font-bold transition-all ${newProduct.available_sizes?.includes(size) ? 'bg-[#E11D48] text-white' : 'bg-zinc-900 text-zinc-500 hover:text-white'}`}>{size}</button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block">Disponibilidade / Rede</label>
                                <div className="space-y-3 bg-zinc-900 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => {
                                            if(newProduct.network_tags.includes('*')) setNewProduct({...newProduct, network_tags: []});
                                            else setNewProduct({...newProduct, network_tags: ['*']});
                                        }} className={`w-6 h-6 rounded-lg border flex items-center justify-center ${newProduct.network_tags.includes('*') ? 'bg-[#E11D48] border-[#E11D48]' : 'border-zinc-700'}`}>{newProduct.network_tags.includes('*') && <Check size={14} className="text-white"/>}</button>
                                        <span className="text-sm font-bold text-white uppercase">Todos os Clientes</span>
                                    </div>
                                    <div className="h-px bg-white/5 my-2"></div>
                                    {availableNetworks.map(net => (
                                        <div key={net} className="flex items-center gap-3">
                                            <button onClick={() => {
                                                let tags = newProduct.network_tags.filter(t => t !== '*');
                                                if(tags.includes(net)) tags = tags.filter(t => t !== net); else tags.push(net);
                                                setNewProduct({...newProduct, network_tags: tags});
                                            }} className={`w-6 h-6 rounded-lg border flex items-center justify-center ${newProduct.network_tags.includes(net) ? 'bg-[#E11D48] border-[#E11D48]' : 'border-zinc-700'}`}>{newProduct.network_tags.includes(net) && <Check size={14} className="text-white"/>}</button>
                                            <span className="text-sm text-zinc-400 uppercase">{net}</span>
                                        </div>
                                    ))}
                                    <div className="pt-2">
                                        <input className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-xs text-white" placeholder="Adicionar manualmente (Ex: nova-rede)" onKeyDown={(e) => {
                                            if(e.key === 'Enter'){
                                                const val = e.currentTarget.value.trim();
                                                if(val && !availableNetworks.includes(val)) {
                                                    setAvailableNetworks([...availableNetworks, val]);
                                                    e.currentTarget.value = '';
                                                }
                                            }
                                        }}/>
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleProductSubmit} className="w-full bg-[#E11D48] text-white font-black py-6 rounded-2xl uppercase shadow-lg hover:bg-rose-600 transition-colors">{editingId ? 'Salvar Alterações' : 'Publicar Produto'}</button>
                            {editingId && <button onClick={() => { setEditingId(null); setNewProduct({ name: '', price: '', image_url: '', additional_images: [], network_tags: [], category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] }); }} className="w-full bg-zinc-800 text-white font-black py-4 rounded-2xl uppercase text-xs">Cancelar Edição</button>}
                        </div>
                    </div>
                 </div>

                 {/* PRODUCT LIST */}
                 <div className="mb-10 flex items-center justify-between">
                     <div className="flex items-center gap-3"><Filter className="text-[#E11D48]"/><h2 className="text-xl font-black uppercase text-white">Catálogo Cadastrado</h2></div>
                     <div className="flex gap-2">
                         <button onClick={() => setProductFilter('TODOS')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${productFilter === 'TODOS' ? 'bg-[#E11D48] text-white' : 'bg-zinc-900 text-zinc-500'}`}>Todos</button>
                         {availableNetworks.map(n => <button key={n} onClick={() => setProductFilter(n)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${productFilter === n ? 'bg-[#E11D48] text-white' : 'bg-zinc-900 text-zinc-500'}`}>{n}</button>)}
                     </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-20">
                     {products.filter(p => productFilter === 'TODOS' ? true : (p.network_tag === productFilter || p.network_tag === '*')).map(product => (
                         <div key={product.id} className="bg-zinc-950 border border-white/5 rounded-3xl p-4 flex gap-4 items-center group hover:border-[#E11D48]/30 transition-colors">
                             <img src={product.image_url} className="w-20 h-24 object-cover rounded-xl bg-zinc-900"/>
                             <div className="flex-1 min-w-0">
                                 <h4 className="text-xs font-black text-white uppercase truncate mb-1">{product.name}</h4>
                                 <p className="text-[10px] text-zinc-500 uppercase mb-2">{product.network_tag === '*' ? 'Todas as Redes' : product.network_tag}</p>
                                 <div className="flex gap-2">
                                     <button onClick={() => handleEditProduct(product)} className="px-3 py-1.5 bg-zinc-900 text-white text-[9px] font-black uppercase rounded-lg hover:bg-zinc-800">Editar</button>
                                     <button onClick={() => handleDeleteProduct(product.id)} className="px-3 py-1.5 bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase rounded-lg hover:bg-rose-500/20">Excluir</button>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
                </>
             )}

             {/* PENDING ORDERS TAB */}
             {adminTab === 'pending' && (
                 <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-8">
                     <h3 className="text-2xl font-black uppercase text-white mb-8">Pedidos Pendentes</h3>
                     <div className="space-y-4">
                         {orders.filter(o => o.status !== 'PEDIDO PRODUZIDO' && o.status !== 'PAGO / EM PRODUÇÃO' && o.status !== 'PAGAMENTO RECUSADO').map(order => (
                             <div key={order.id} className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                 <div>
                                     <div className="flex items-center gap-3 mb-2">
                                         <span className="bg-zinc-800 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-black uppercase">#{order.id.slice(0,8)}</span>
                                         <span className="text-xs font-bold text-white uppercase">{order.unit_name}</span>
                                     </div>
                                     <p className="text-[10px] text-zinc-500 uppercase mb-4">{formatDate(order.created_at)} • {order.items.length} Itens • {formatCurrency(order.total_price)}</p>
                                     <div className="flex gap-2">
                                        {order.items.map((item, idx) => (
                                            <div key={idx} className="relative group">
                                                <img src={item.image_url} className="w-10 h-10 rounded-lg object-cover border border-white/10"/>
                                                <span className="absolute -top-2 -right-2 bg-zinc-800 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-black">{item.quantity}</span>
                                            </div>
                                        ))}
                                     </div>
                                 </div>
                                 <div className="flex flex-col items-end gap-3">
                                     <div className="px-4 py-2 rounded-xl bg-yellow-500/10 text-yellow-500 text-[10px] font-black uppercase border border-yellow-500/20">{order.status}</div>
                                     <div className="flex gap-2">
                                         <button onClick={() => handleStatusUpdate(order.id, 'PAGAMENTO RECUSADO')} className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-xl text-[10px] font-black uppercase hover:bg-red-900/30 hover:text-red-500">Recusar</button>
                                         <button onClick={() => handleStatusUpdate(order.id, 'PAGO / EM PRODUÇÃO')} className="px-4 py-2 bg-[#E11D48] text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-600 shadow-lg shadow-rose-900/20">Aprovar Produção</button>
                                     </div>
                                 </div>
                             </div>
                         ))}
                         {orders.filter(o => o.status !== 'PEDIDO PRODUZIDO' && o.status !== 'PAGO / EM PRODUÇÃO' && o.status !== 'PAGAMENTO RECUSADO').length === 0 && <p className="text-center text-zinc-500 py-10">Nenhum pedido pendente.</p>}
                     </div>
                 </div>
             )}

             {/* ACESSOS (NEW HISTORY LAYOUT) TAB */}
             {adminTab === 'history' && (
                 <div className="space-y-8">
                     {/* Dashboard Cards Row */}
                     <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                        <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-32">
                           <p className="text-[10px] font-bold uppercase text-zinc-500">Total</p>
                           <h3 className="text-3xl font-black text-white">{orders.length}</h3>
                        </div>
                        <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-32">
                           <p className="text-[10px] font-bold uppercase text-yellow-500">Pendentes</p>
                           <h3 className="text-3xl font-black text-yellow-500">{orders.filter(o => o.status !== 'PEDIDO PRODUZIDO' && o.status !== 'PAGO / EM PRODUÇÃO' && o.status !== 'PAGAMENTO RECUSADO').length}</h3>
                        </div>
                        <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-32">
                           <p className="text-[10px] font-bold uppercase text-blue-500">Produzindo</p>
                           <h3 className="text-3xl font-black text-blue-500">{orders.filter(o => o.status === 'PAGO / EM PRODUÇÃO').length}</h3>
                        </div>
                        <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-32">
                           <p className="text-[10px] font-bold uppercase text-emerald-500">Prontos</p>
                           <h3 className="text-3xl font-black text-emerald-500">{orders.filter(o => o.status === 'PEDIDO PRODUZIDO').length}</h3>
                        </div>
                        <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-32">
                           <p className="text-[10px] font-bold uppercase text-red-500">Recusados</p>
                           <h3 className="text-3xl font-black text-red-500">{orders.filter(o => o.status === 'PAGAMENTO RECUSADO').length}</h3>
                        </div>
                        <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-32 relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/5 blur-2xl rounded-full pointer-events-none"></div>
                           <p className="text-[10px] font-bold uppercase text-[#E11D48]">Receita</p>
                           <h3 className="text-3xl font-black text-[#E11D48] tracking-tight">{formatCurrency(orders.filter(o => o.status === 'PAGO / EM PRODUÇÃO' || o.status === 'PEDIDO PRODUZIDO').reduce((acc, curr) => acc + curr.total_price, 0))}</h3>
                        </div>
                     </div>

                     {/* Filters Row */}
                     <div className="flex flex-wrap gap-2">
                        {['TODOS', 'EM PRODUÇÃO', 'PRODUZIDOS', 'RECUSADOS'].map(filter => (
                          <button 
                            key={filter} 
                            onClick={() => setHistorySubFilter(filter)}
                            className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${historySubFilter === filter ? 'bg-[#E11D48] text-white shadow-lg shadow-rose-900/20' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:bg-zinc-800'}`}
                          >
                            {filter}
                          </button>
                        ))}
                     </div>

                     {/* List Row */}
                     <div className="space-y-4">
                        {orders
                          .filter(o => {
                             if (historySubFilter === 'TODOS') return true;
                             if (historySubFilter === 'EM PRODUÇÃO') return o.status === 'PAGO / EM PRODUÇÃO';
                             if (historySubFilter === 'PRODUZIDOS') return o.status === 'PEDIDO PRODUZIDO';
                             if (historySubFilter === 'RECUSADOS') return o.status === 'PAGAMENTO RECUSADO';
                             return true;
                          })
                          .map(order => (
                            <div key={order.id} className="bg-zinc-950 border border-white/5 p-8 rounded-[32px] hover:border-[#E11D48]/20 transition-colors group">
                                <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-4 mb-2">
                                            <h3 className="text-lg font-black text-white uppercase">{order.unit_name}</h3>
                                            
                                            {/* STATUS LABEL EDITABLE */}
                                            <div className="relative">
                                                <button 
                                                    onClick={() => setActiveStatusDropdownId(activeStatusDropdownId === order.id ? null : order.id)}
                                                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border flex items-center gap-1 hover:brightness-110 transition-all ${
                                                    order.status === 'PEDIDO PRODUZIDO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                    order.status === 'PAGO / EM PRODUÇÃO' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                    order.status === 'PAGAMENTO RECUSADO' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                }`}>
                                                    {order.status === 'AGUARDANDO VALIDAÇÃO' ? 'AGUARDANDO VALIDAÇÃO' : order.status}
                                                    <ChevronDown size={12} />
                                                </button>
                                                
                                                {activeStatusDropdownId === order.id && (
                                                    <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden flex flex-col">
                                                        <button onClick={() => handleStatusUpdate(order.id, 'PAGO / EM PRODUÇÃO')} className="px-4 py-3 text-left text-[10px] font-bold text-blue-500 hover:bg-white/5 uppercase">Em Produção</button>
                                                        <button onClick={() => handleStatusUpdate(order.id, 'PEDIDO PRODUZIDO')} className="px-4 py-3 text-left text-[10px] font-bold text-emerald-500 hover:bg-white/5 uppercase">Produzido</button>
                                                        <button onClick={() => handleStatusUpdate(order.id, 'PAGAMENTO RECUSADO')} className="px-4 py-3 text-left text-[10px] font-bold text-red-500 hover:bg-white/5 uppercase">Recusado</button>
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <p className="text-zinc-400 text-xs font-medium">{order.user_email}</p>
                                            <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-wide">PEDIDO #{order.id.slice(0,8).toUpperCase()} • {formatDate(order.created_at)}</p>
                                        </div>
                                        <button onClick={() => setSelectedOrderForDetails(order)} className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500 group-hover:text-white transition-colors">
                                            <ChevronRight size={14}/> Ver {order.items.length} Item(s)
                                        </button>
                                    </div>
                                    <div className="flex flex-col items-end justify-center">
                                        <h3 className="text-2xl font-black text-[#E11D48] mb-1">{formatCurrency(order.total_price)}</h3>
                                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">PIX</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {orders.length === 0 && <p className="text-zinc-500 text-center py-10">Nenhum registro encontrado.</p>}
                     </div>
                 </div>
             )}
             
             {/* USERS TAB */}
             {adminTab === 'users' && (
                 <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-8">
                     <h3 className="text-2xl font-black uppercase text-white mb-8">Usuários Cadastrados</h3>
                     <div className="grid grid-cols-1 gap-4">
                        {usersList.map(user => (
                            <div key={user.id} onClick={() => setSelectedUserForModal(user)} className="flex items-center justify-between p-6 bg-zinc-900 rounded-3xl border border-white/5 cursor-pointer hover:border-[#E11D48]/30 transition-all group">
                                <div className="flex-1">
                                    <p className="text-sm font-black text-white uppercase mb-1">{user.unit_name}</p>
                                    <p className="text-[11px] text-zinc-500">{user.email}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>{user.role}</span>
                                    {user.role !== 'admin' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.id); }} 
                                            className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                                            title="Excluir Usuário"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                     </div>
                 </div>
             )}
         </div>
         
         {/* USER DETAILS MODAL (ADMIN) */}
         <AnimatePresence>
             {selectedUserForModal && (
                 <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
                    <motion.div initial={{scale: 0.9, y: 20}} animate={{scale: 1, y: 0}} exit={{scale: 0.9, y: 20}} className="bg-zinc-950 border border-white/10 w-full max-w-lg rounded-[40px] overflow-hidden relative">
                        <div className="bg-zinc-900/50 p-8 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase">{selectedUserForModal.unit_name}</h3>
                                <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest">{selectedUserForModal.network_tag}</p>
                            </div>
                            <button onClick={() => setSelectedUserForModal(null)} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors"><X size={20}/></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><UserIcon className="text-blue-500" size={20}/></div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Responsável</p>
                                    <p className="text-white font-medium">{selectedUserForModal.contact_name || 'Não informado'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Phone className="text-emerald-500" size={20}/></div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Telefone / WhatsApp</p>
                                    <p className="text-white font-medium">{selectedUserForModal.phone || 'Não informado'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0"><Mail className="text-purple-500" size={20}/></div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">E-mail de Acesso</p>
                                    <p className="text-white font-medium">{selectedUserForModal.email}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0"><FileText className="text-orange-500" size={20}/></div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">CNPJ</p>
                                    <p className="text-white font-medium">{selectedUserForModal.cnpj || 'Não informado'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0"><MapPin className="text-rose-500" size={20}/></div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Endereço de Entrega</p>
                                    <p className="text-white font-medium">
                                        {selectedUserForModal.address_street ? 
                                            `${selectedUserForModal.address_street}, ${selectedUserForModal.address_city} - ${selectedUserForModal.address_state}` 
                                            : 'Endereço não cadastrado'}
                                    </p>
                                    {selectedUserForModal.cep && <p className="text-zinc-500 text-xs mt-1">CEP: {selectedUserForModal.cep}</p>}
                                </div>
                            </div>
                        </div>
                        <div className="p-8 pt-0">
                            <button onClick={() => setSelectedUserForModal(null)} className="w-full bg-zinc-900 border border-white/5 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-zinc-800 transition-colors">Fechar Detalhes</button>
                        </div>
                    </motion.div>
                 </motion.div>
             )}
         </AnimatePresence>

         {/* ORDER ITEMS MODAL (ADMIN) */}
         <AnimatePresence>
             {selectedOrderForDetails && (
                 <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
                    <motion.div initial={{scale: 0.9, y: 20}} animate={{scale: 1, y: 0}} exit={{scale: 0.9, y: 20}} className="bg-zinc-950 border border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-[40px] overflow-hidden relative">
                        <div className="bg-zinc-900/50 p-8 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase">Itens do Pedido</h3>
                                <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest">#{selectedOrderForDetails.id.slice(0,8)} • {selectedOrderForDetails.unit_name}</p>
                            </div>
                            <button onClick={() => setSelectedOrderForDetails(null)} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors"><X size={20}/></button>
                        </div>
                        <div className="p-8 overflow-y-auto space-y-4">
                            {selectedOrderForDetails.items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-4 bg-zinc-900 p-4 rounded-2xl border border-white/5">
                                    <div className="w-16 h-16 bg-zinc-950 rounded-xl overflow-hidden shrink-0">
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover"/>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-black text-white uppercase mb-1">{item.name}</h4>
                                        <div className="flex gap-4 text-xs text-zinc-500 uppercase font-bold">
                                            <span>Tam: <span className="text-white">{item.selectedSize}</span></span>
                                            <span>Qtd: <span className="text-white">{item.quantity}</span></span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-[#E11D48]">{formatCurrency(item.price * item.quantity)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-8 pt-0 bg-zinc-950 border-t border-white/5 mt-auto">
                            <div className="flex justify-between items-center py-6">
                                <span className="text-zinc-500 font-black uppercase text-xs">Valor Total</span>
                                <span className="text-2xl font-black text-[#E11D48]">{formatCurrency(selectedOrderForDetails.total_price)}</span>
                            </div>
                            <button onClick={() => setSelectedOrderForDetails(null)} className="w-full bg-zinc-900 border border-white/5 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-zinc-800 transition-colors">Fechar Visualização</button>
                        </div>
                    </motion.div>
                 </motion.div>
             )}
         </AnimatePresence>
      </div>
    );
  }

  // --- CLIENT INTERFACE ---
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5">
        <div className="w-full max-w-[96%] mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Logo />
            <div className="bg-zinc-900/50 border border-white/10 rounded-full px-5 py-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">{(currentUser.network_tag || '').toUpperCase()} / {currentUser.unit_name.toUpperCase()}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="hover:text-white transition-colors"><Bell size={20}/></button>
            <button onClick={() => setIsHistoryOpen(true)} className="hover:text-white transition-colors"><List size={20}/></button>
            <button onClick={() => setIsCartOpen(true)} className="relative hover:text-[#E11D48] transition-colors">
              <ShoppingCart size={20}/>
              {cart.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E11D48] rounded-full text-[9px] flex items-center justify-center font-bold text-white">{cart.length}</span>}
            </button>
            <button onClick={handleLogout} className="hover:text-white transition-colors"><LogOut size={20}/></button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[96%] mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-black uppercase text-white mb-2">Catálogo Oficial</h1>
          <p className="text-[11px] font-bold uppercase text-zinc-500 tracking-[0.3em]">Selecione os uniformes de sua unidade</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.filter(p => p.network_tag === '*' || p.network_tag === currentUser.network_tag).map(p => (
            <div key={p.id} className="group bg-zinc-950 rounded-[32px] overflow-hidden border border-white/5 hover:border-[#E11D48]/30 transition-all">
              <div className="h-[320px] relative">
                <img src={p.image_url} className="w-full h-full object-cover"/>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <button onClick={() => setDetailsModalOpenId(p.id)} className="bg-white text-black px-6 py-3 rounded-full font-black uppercase text-[10px]">Detalhes</button>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-sm font-black text-white uppercase mb-1">{p.name}</h3>
                <p className="text-xl font-black text-[#E11D48]">{formatCurrency(p.price)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* MEUS PEDIDOS RECENTES SECTION */}
        <div className="mt-16 border-t border-white/5 pt-10">
            <div className="flex items-center gap-3 mb-8 border-l-4 border-[#E11D48] pl-4">
                <h2 className="text-2xl font-black uppercase text-white">Meus Pedidos Recentes</h2>
            </div>
            <div className="space-y-4">
                {orders.slice(0, 3).map(order => (
                    <div key={order.id} className="bg-zinc-950 border border-white/5 p-8 rounded-[32px] flex flex-col md:flex-row justify-between items-center group hover:border-[#E11D48]/30 transition-all">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">PEDIDO #{order.id.slice(0,8).toUpperCase()}</p>
                            <div className="flex items-center gap-4">
                                <span className="text-lg font-black text-white uppercase">{order.items.length} Item(s)</span>
                                <span className="text-zinc-600">•</span>
                                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase border ${
                                    order.status === 'PEDIDO PRODUZIDO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                    order.status === 'PAGO / EM PRODUÇÃO' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}>
                                    {order.status}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 md:mt-0 text-right">
                            <h3 className="text-3xl font-black text-[#E11D48]">{formatCurrency(order.total_price)}</h3>
                        </div>
                    </div>
                ))}
                {orders.length === 0 && <p className="text-zinc-500 text-sm">Nenhum pedido recente.</p>}
            </div>
        </div>

      </main>

      {/* DETALHES MODAL */}
      <AnimatePresence>
        {detailsModalOpenId && (() => {
           const p = products.find(prod => prod.id === detailsModalOpenId);
           if(!p) return null;
           const images = [p.image_url, ...(p.additional_images || [])];
           return (
            <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
               <div className="bg-zinc-950 border border-white/10 w-full max-w-6xl h-[90vh] rounded-[48px] overflow-hidden flex flex-col lg:flex-row relative">
                  <button onClick={() => { setDetailsModalOpenId(null); setSelectedSize(null); setActiveModalImage(null); }} className="absolute top-8 right-8 z-10 bg-black/50 p-2 rounded-full text-white hover:bg-[#E11D48]"><X/></button>
                  <div className="lg:w-1/2 h-1/2 lg:h-full relative bg-zinc-900">
                     <img src={activeModalImage || p.image_url} className="w-full h-full object-cover"/>
                     <div className="absolute bottom-8 left-0 w-full flex justify-center gap-4 px-8">
                         {images.map(img => (
                             <button key={img} onClick={() => setActiveModalImage(img)} className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${activeModalImage === img || (!activeModalImage && img === p.image_url) ? 'border-[#E11D48]' : 'border-white/20'}`}><img src={img} className="w-full h-full object-cover"/></button>
                         ))}
                     </div>
                  </div>
                  <div className="lg:w-1/2 h-1/2 lg:h-full p-12 overflow-y-auto flex flex-col justify-center">
                      <h2 className="text-4xl font-black text-white uppercase mb-2">{p.name}</h2>
                      <h3 className="text-3xl font-black text-[#E11D48] mb-8">{formatCurrency(p.price)}</h3>
                      <div className="space-y-6 mb-12">
                          <div><p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Sobre o Produto</p><p className="text-zinc-300 text-sm leading-relaxed">{p.description || "Sem descrição."}</p></div>
                          <div className="flex gap-4">
                              <div className="bg-zinc-900 p-4 rounded-2xl border border-white/5 flex-1"><div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-[#E11D48]"/><span className="text-[9px] font-bold uppercase text-zinc-500">Prazo de Produção</span></div><p className="text-sm font-bold text-white">{p.production_days} Dias Úteis</p></div>
                              <div className="bg-zinc-900 p-4 rounded-2xl border border-white/5 flex-1"><div className="flex items-center gap-2 mb-1"><Package size={14} className="text-[#E11D48]"/><span className="text-[9px] font-bold uppercase text-zinc-500">Pedido Mínimo</span></div><p className="text-sm font-bold text-white">{p.min_order} Unidades</p></div>
                          </div>
                          <div>
                              <p className="text-[10px] font-bold uppercase text-zinc-500 mb-3">Selecione o Tamanho</p>
                              <div className="flex flex-wrap gap-2">
                                  {(p.available_sizes || []).map(s => (
                                      <button key={s} onClick={() => setSelectedSize(s)} className={`w-12 h-12 rounded-xl text-xs font-black transition-all ${selectedSize === s ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 hover:text-white'}`}>{s}</button>
                                  ))}
                              </div>
                          </div>
                      </div>
                      <button onClick={() => {
                          if(!selectedSize) return showToast("Selecione um tamanho", "error");
                          setCart([...cart, { ...p, selectedSize: selectedSize, quantity: p.min_order }]);
                          setDetailsModalOpenId(null); setSelectedSize(null);
                          showToast("Adicionado ao carrinho");
                      }} className="w-full bg-white text-black py-6 rounded-2xl font-black uppercase text-sm hover:bg-zinc-200 transition-colors">Adicionar ao Pedido ({p.min_order} UN)</button>
                  </div>
               </div>
            </div>
           );
        })()}
      </AnimatePresence>

      {/* HISTORY MODAL (CLIENT) */}
      <AnimatePresence>
        {isHistoryOpen && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-[160] bg-black/95 flex items-center justify-center p-4">
                <div className="bg-zinc-950 border border-white/10 w-full max-w-4xl h-[85vh] rounded-[48px] flex flex-col overflow-hidden">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
                        <div className="flex items-center gap-3">
                            <History className="text-[#E11D48]" />
                            <h2 className="text-2xl font-black uppercase text-white">Meu Histórico</h2>
                        </div>
                        <button onClick={() => setIsHistoryOpen(false)} className="w-10 h-10 rounded-full bg-black/20 hover:bg-white/10 flex items-center justify-center text-white"><X size={20}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 space-y-4">
                        {orders.map(order => (
                            <div key={order.id} className="bg-zinc-900 border border-white/5 p-6 rounded-[32px] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="bg-zinc-800 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-black uppercase">#{order.id.slice(0,8)}</span>
                                        <span className="text-xs font-bold text-white uppercase">{formatDate(order.created_at)}</span>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        {order.items.slice(0, 5).map((item, idx) => (
                                            <div key={idx} className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10">
                                                <img src={item.image_url} className="w-full h-full object-cover"/>
                                            </div>
                                        ))}
                                        {order.items.length > 5 && <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">+{order.items.length - 5}</div>}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border ${
                                        order.status === 'PEDIDO PRODUZIDO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                        order.status === 'PAGO / EM PRODUÇÃO' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                        order.status === 'PAGAMENTO RECUSADO' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>{order.status}</span>
                                    <h3 className="text-xl font-black text-[#E11D48]">{formatCurrency(order.total_price)}</h3>
                                </div>
                            </div>
                        ))}
                        {orders.length === 0 && <div className="h-full flex flex-col items-center justify-center text-zinc-500"><History size={48} className="mb-4 opacity-20"/><p>Você ainda não realizou pedidos.</p></div>}
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCartOpen && (
          <motion.div initial={{x: '100%'}} animate={{x: 0}} exit={{x: '100%'}} className="fixed top-0 right-0 h-full w-full max-w-md bg-[#09090b] z-[150] flex flex-col border-l border-white/10">
            <div className="p-8 flex justify-between items-center border-b border-white/5">
              <h2 className="text-2xl font-black uppercase text-white">CARRINHO</h2>
              <button onClick={() => setIsCartOpen(false)}><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {cart.map((item, idx) => (
                <div key={idx} className="bg-zinc-900 p-4 rounded-3xl flex gap-4 items-center">
                  <img src={item.image_url} className="w-16 h-16 rounded-xl object-cover"/>
                  <div className="flex-1">
                    <h4 className="text-xs font-black text-white uppercase">{item.name}</h4>
                    <p className="text-[10px] text-zinc-500 uppercase">TAM: {item.selectedSize} | QTD: {item.quantity}</p>
                  </div>
                  <button onClick={() => setCart(cart.filter((_,i)=>i!==idx))} className="text-zinc-600 hover:text-rose-500"><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
            <div className="p-8 border-t border-white/5">
              <div className="bg-zinc-900 p-4 rounded-2xl mb-6 flex gap-2">
                <input placeholder="CEP" value={cep} onChange={e => setCep(e.target.value)} className="bg-transparent border-none outline-none flex-1 text-sm text-white"/>
                <button onClick={calculateShipping} className="text-[#E11D48] font-black uppercase text-[10px]">Calcular</button>
              </div>
              <div className="flex justify-between items-center mb-6">
                <span className="text-zinc-500 font-black uppercase text-xs">Total</span>
                <span className="text-2xl font-black text-[#E11D48]">{formatCurrency(cart.reduce((a,b)=>a+b.price*b.quantity,0) + (shippingCost || 0))}</span>
              </div>
              <button onClick={() => { if(!shippingCost) return showToast("Calcule o frete", "error"); setIsPaymentOpen(true); }} className="w-full bg-[#E11D48] text-white py-5 rounded-3xl font-black uppercase text-xs mb-4 hover:bg-rose-600 transition-colors">PAGAR COM PIX</button>
              <button onClick={handleWhatsAppQuote} className="w-full border border-white/10 text-white py-5 rounded-3xl font-black uppercase text-[10px] hover:bg-white/5 transition-colors">PARCELAMENTO / DÚVIDAS VIA WHATSAPP</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
          {isPaymentOpen && (
              <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6">
                  <div className="bg-zinc-950 border border-white/10 p-12 rounded-[48px] text-center max-w-sm w-full">
                      <h2 className="text-2xl font-black uppercase text-white mb-8">Pagamento Pix</h2>
                      <div className="bg-white p-4 rounded-3xl mb-8 mx-auto w-fit">
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getPixCode())}`} alt="QR"/>
                      </div>
                      <button onClick={handleFinalize} className="w-full bg-[#E11D48] text-white py-4 rounded-2xl font-black uppercase text-xs">Confirmar Pagamento</button>
                      <button onClick={() => setIsPaymentOpen(false)} className="mt-6 text-zinc-500 text-[10px] uppercase font-black">Cancelar</button>
                  </div>
              </div>
          )}
      </AnimatePresence>
      <AnimatePresence>
          {isOrderSuccessOpen && (
              <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6">
                  <div className="bg-zinc-950 border border-white/10 p-12 rounded-[48px] text-center max-w-md w-full">
                      <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><Check size={40} className="text-emerald-500"/></div>
                      <h2 className="text-2xl font-black uppercase text-white mb-2">Pedido Realizado!</h2>
                      <p className="text-zinc-500 text-xs mb-8">Aguarde a validação do pagamento. Você será notificado.</p>
                      <button onClick={() => setIsOrderSuccessOpen(false)} className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase text-xs">Voltar ao Catálogo</button>
                  </div>
              </div>
          )}
      </AnimatePresence>

      {/* WHATSAPP FLOAT BUTTON */}
      <a
        href="https://wa.me/551732167854"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[90] bg-[#25D366] p-4 rounded-full shadow-[0_0_20px_rgba(37,211,102,0.4)] hover:brightness-110 transition-all hover:scale-110 flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </div>
  );
}