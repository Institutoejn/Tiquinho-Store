
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, Hourglass, Loader2, UserPlus, LogIn, ShieldCheck,
  TrendingUp, DollarSign, Package, PlusCircle, Trash2, Image as ImageIcon, MessageCircle, QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, CartItem, Size, User as UserType, Order } from './types';
import { supabase } from './supabaseClient';

// --- COMPONENTES AUXILIARES ---
const Logo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} bg-[#E11D48] rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/20 select-none`}>
    <span className="text-2xl font-black text-white italic tracking-tighter -skew-x-6">T</span>
  </div>
);

const Spinner = () => (
  <div className="fixed inset-0 z-[300] bg-[#09090b] flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-[#E11D48]/20 border-t-[#E11D48] rounded-full animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 bg-[#E11D48] rounded-full animate-pulse"></div>
      </div>
    </div>
    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 animate-pulse">Sincronizando Sistema</p>
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

// --- APP PRINCIPAL ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [formData, setFormData] = useState({ 
    email: '', password: '', unit_name: '', network_tag: 'drogaria-total', role: 'user' as 'user' | 'admin', adminKey: '' 
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Inicializa como true para verificar sessão
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', min_order: '10', production_days: '15'
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verificação inicial de sessão com validação no banco
  useEffect(() => {
    const validateSession = async () => {
      const saved = localStorage.getItem('tiquinho_session');
      if (saved) {
        try {
          const user = JSON.parse(saved);
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

          if (data && !error) {
            setCurrentUser(data);
          } else {
            localStorage.removeItem('tiquinho_session');
          }
        } catch (e) {
          localStorage.removeItem('tiquinho_session');
        }
      }
      setIsLoading(false);
    };
    validateSession();
  }, []);

  // Busca dados apenas se houver usuário válido
  useEffect(() => {
    if (currentUser) {
      fetchInitialData();
    }
  }, [currentUser]);

  const fetchInitialData = async () => {
    if (!currentUser) return;
    try {
      let query = supabase.from('products').select('*');
      
      if (currentUser?.role === 'admin') {
        const { data: prods } = await query.order('name');
        if (prods) setProducts(prods);
        const { data: ords } = await supabase.from('orders').select('*');
        if (ords) setOrders(ords);
      } else {
        const userTag = currentUser?.network_tag?.toLowerCase().trim() || 'generica';
        const { data: prods } = await query
          .or(`network_tag.eq.${userTag},network_tag.eq.generica`)
          .order('name');
        if (prods) setProducts(prods);
      }
    } catch (err) { 
      console.error('Data sync error:', err); 
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').eq('email', formData.email.toLowerCase().trim()).eq('password', formData.password).single();
      if (error || !data) {
        localStorage.removeItem('tiquinho_session');
        throw new Error('E-mail ou senha inválidos.');
      }
      
      const sessionUser: UserType = {
        ...data,
        network_tag: data.network_tag?.toLowerCase().trim() || 'generica'
      };

      setCurrentUser(sessionUser);
      localStorage.setItem('tiquinho_session', JSON.stringify(sessionUser));
      showToast(`Bem-vindo, ${sessionUser.unit_name}!`);
    } catch (err: any) { 
      showToast(err.message, 'error'); 
      localStorage.removeItem('tiquinho_session');
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    if (formData.role === 'admin' && formData.adminKey !== 'TIQUINHO2026') {
      showToast("Chave Admin Inválida", "error");
      setIsLoading(false);
      return;
    }
    try {
      const normalizedTag = formData.role === 'admin' ? 'admin' : formData.network_tag.toLowerCase().trim();
      const newUser = { 
        email: formData.email.toLowerCase().trim(), 
        password: formData.password, 
        unit_name: formData.unit_name, 
        network_tag: normalizedTag, 
        role: formData.role 
      };
      const { data, error } = await supabase.from('users').insert([newUser]).select().single();
      if (error) throw error;
      
      setCurrentUser(data);
      localStorage.setItem('tiquinho_session', JSON.stringify(data));
      showToast("Cadastro realizado com sucesso!");
    } catch (err: any) { 
      showToast("Erro no cadastro. Tente outro e-mail.", "error"); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleLogout = () => { 
    setCurrentUser(null); 
    setProducts([]);
    setOrders([]);
    localStorage.removeItem('tiquinho_session'); 
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const normalizedNetworkTag = newProduct.network_tag.toLowerCase().trim();
    const payload = {
      name: newProduct.name, 
      price: parseFloat(newProduct.price), 
      image_url: newProduct.image_url,
      network_tag: normalizedNetworkTag, 
      category: newProduct.category,
      min_order: parseInt(newProduct.min_order), 
      production_days: parseInt(newProduct.production_days)
    };
    
    try {
      if (editingId) await supabase.from('products').update(payload).eq('id', editingId);
      else await supabase.from('products').insert([payload]);
      
      showToast("Sucesso!");
      fetchInitialData();
      setEditingId(null);
      setNewProduct({ name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', min_order: '10', production_days: '15' });
    } catch (err) { showToast("Erro ao salvar produto", "error"); }
    finally { setIsLoading(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewProduct(prev => ({ ...prev, image_url: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const revenue = useMemo(() => orders.reduce((acc, o) => acc + (o.total_price || 0), 0), [orders]);

  // Bloqueio de renderização durante carregamento inicial
  if (isLoading && !currentUser) return <Spinner />;

  // Renderização da Tela de Login/Cadastro
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#E11D48]/10 rounded-full blur-[120px]" />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md z-10">
          <div className="flex flex-col items-center mb-10"><Logo className="w-20 h-20 mb-4" /><h1 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em]">Tiquinho Corporate</h1></div>
          <div className="glass p-10 rounded-[40px] shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? 'Novo Cadastro' : 'Login Restrito'}</h2>
            <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
              {isSigningUp && (
                <div className="space-y-4 mb-4">
                  <div className="flex p-1 bg-zinc-950 rounded-2xl border border-white/5 relative">
                    <motion.div className="absolute inset-y-1 bg-[#E11D48] rounded-xl shadow-lg" animate={{ x: formData.role === 'admin' ? '100%' : '0%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }} style={{ width: 'calc(50% - 4px)' }} />
                    <button type="button" onClick={() => setFormData({...formData, role: 'user'})} className={`relative z-10 flex-1 py-2 text-[10px] font-black uppercase transition-colors ${formData.role === 'user' ? 'text-white' : 'text-zinc-500'}`}>Franqueado</button>
                    <button type="button" onClick={() => setFormData({...formData, role: 'admin'})} className={`relative z-10 flex-1 py-2 text-[10px] font-black uppercase transition-colors ${formData.role === 'admin' ? 'text-white' : 'text-zinc-500'}`}>Gestor</button>
                  </div>
                  {formData.role === 'admin' && <input type="password" placeholder="Chave de Acesso" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} className="w-full bg-[#E11D48]/5 border border-[#E11D48]/20 p-4 rounded-2xl text-white text-sm" required />}
                  <input type="text" placeholder="Nome da Unidade" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
                </div>
              )}
              <input type="email" placeholder="E-mail" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
              <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
              {isSigningUp && formData.role === 'user' && (
                <select value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm appearance-none">
                  <option value="drogaria-total">Drogaria Total</option>
                  <option value="farmacia-abc">Farmácia ABC</option>
                  <option value="generica">Rede Independente</option>
                </select>
              )}
              <button type="submit" disabled={isLoading} className="w-full bg-[#E11D48] text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-rose-600/20 flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : (isSigningUp ? 'Finalizar' : 'Entrar')}
              </button>
            </form>
            <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase hover:text-white transition-colors">{isSigningUp ? 'Voltar' : 'Criar Conta'}</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- PAINEL GESTOR (ADMIN) ---
  if (currentUser?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-20">
        {isLoading && <Spinner />}
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        
        <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3"><Logo className="w-10 h-10" /><h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Painel de Gestão</h2></div>
          <button onClick={handleLogout} className="p-3 bg-zinc-800 rounded-2xl text-zinc-400 hover:text-[#E11D48]"><LogOut size={20} /></button>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
          {/* SEÇÃO 1: PERFORMANCE GLOBAL */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass p-8 rounded-[32px] flex items-center gap-6 border-l-4 border-l-[#E11D48]">
              <div className="p-4 bg-rose-600/10 text-[#E11D48] rounded-2xl"><DollarSign size={24} /></div>
              <div><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Receita Global</p><h3 className="text-2xl font-black">R$ {revenue.toLocaleString()}</h3></div>
            </div>
            <div className="glass p-8 rounded-[32px] flex items-center gap-6 border-l-4 border-l-emerald-500">
              <div className="p-4 bg-emerald-600/10 text-emerald-500 rounded-2xl"><TrendingUp size={24} /></div>
              <div><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Total Pedidos</p><h3 className="text-2xl font-black">{orders.length}</h3></div>
            </div>
            <div className="glass p-8 rounded-[32px] flex items-center gap-6 border-l-4 border-l-amber-500">
              <div className="p-4 bg-amber-600/10 text-amber-500 rounded-2xl"><Package size={24} /></div>
              <div><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Modelos Ativos</p><h3 className="text-2xl font-black">{products.length}</h3></div>
            </div>
          </section>

          {/* SEÇÃO 2: CONTROLE DE CATÁLOGO (FORMULÁRIO) */}
          <section className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10">
            <h2 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tighter"><PlusCircle className="text-[#E11D48]" /> {editingId ? 'Editar Uniforme' : 'Novo Cadastro de Uniforme'}</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Nome do Produto" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm md:col-span-2" required />
                <input type="number" step="0.01" placeholder="Preço (R$)" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
                <select value={newProduct.network_tag} onChange={e => setNewProduct({...newProduct, network_tag: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm appearance-none">
                  <option value="drogaria-total">Drogaria Total</option>
                  <option value="farmacia-abc">Farmácia ABC</option>
                  <option value="generica">Uso Geral</option>
                </select>
                <input type="number" placeholder="Mínimo de Peças (Min 10)" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
                <input type="number" placeholder="Prazo de Produção (Dias)" value={newProduct.production_days} onChange={e => setNewProduct({...newProduct, production_days: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
              </div>
              <div onClick={() => fileInputRef.current?.click()} className="min-h-[200px] bg-zinc-950 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48]/30 transition-all overflow-hidden relative">
                {newProduct.image_url ? <img src={newProduct.image_url} className="absolute inset-0 w-full h-full object-cover" /> : <div className="text-zinc-600 text-center"><ImageIcon className="mx-auto mb-2" /><p className="text-[10px] font-black uppercase">Adicionar Foto</p></div>}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>
              <button type="submit" className="md:col-span-3 bg-[#E11D48] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-600/20">{editingId ? 'Salvar Alterações' : 'Publicar no Catálogo'}</button>
            </form>
          </section>

          {/* SEÇÃO 3: LISTAGEM DE INVENTÁRIO (TOTAL) */}
          <section className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Catálogo Global (Sincronizado)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900/40 p-4 rounded-[32px] flex flex-col gap-3 group border border-white/5">
                  <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-950"><img src={p.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" /></div>
                  <div>
                    <h4 className="text-[10px] font-bold text-zinc-300 truncate">{p.name}</h4>
                    <p className="text-[9px] text-zinc-500 uppercase font-black">{p.network_tag}</p>
                    <p className="text-xs font-black text-[#E11D48]">R$ {p.price.toFixed(2)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(p.id); setNewProduct({ ...p, price: p.price.toString(), min_order: p.min_order.toString(), production_days: p.production_days.toString() }); window.scrollTo({ top: 300, behavior: 'smooth' }); }} className="flex-1 bg-zinc-800 py-2 rounded-xl text-[9px] uppercase font-black hover:bg-zinc-700">Editar</button>
                    <button onClick={async () => { if(confirm("Remover do banco de dados?")) { setIsLoading(true); await supabase.from('products').delete().eq('id', p.id); fetchInitialData(); } }} className="p-2 bg-rose-600/10 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // --- LOJA FRANQUEADO (USER) ---
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {isLoading && <Spinner />}
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
        <Logo /><div className="flex gap-3">
          <button onClick={() => setIsCartOpen(true)} className="relative p-3 bg-zinc-900/50 rounded-2xl border border-white/5"><ShoppingCart size={20} />{cart.length > 0 && <span className="absolute -top-1 -right-1 bg-[#E11D48] text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black">{cart.length}</span>}</button>
          <button onClick={handleLogout} className="p-3 text-zinc-500 hover:text-[#E11D48]"><LogOut size={20} /></button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-black mb-1 tracking-tighter uppercase">{currentUser?.unit_name || 'Usuário'}</h1>
        <div className="flex items-center gap-2 mb-12">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <p className="text-zinc-500 font-black uppercase tracking-widest text-[10px]">Filtrado: {currentUser?.network_tag?.replace('-', ' ') || 'Geral'}</p>
        </div>
        
        {products.length === 0 ? (
          <div className="py-20 text-center glass rounded-[40px]">
            <Package className="mx-auto mb-4 text-zinc-800" size={48} />
            <p className="text-zinc-600 font-black uppercase text-xs">Nenhum uniforme disponível para sua rede no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map(p => (
              <div key={p.id} className="bg-zinc-900/40 border border-white/5 rounded-[32px] overflow-hidden flex flex-col group max-w-sm mx-auto w-full shadow-2xl">
                <div className="aspect-square bg-zinc-950 overflow-hidden"><img src={p.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700 opacity-90 group-hover:opacity-100" alt="" /></div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-base font-bold text-white mb-1 line-clamp-1">{p.name}</h3>
                  <p className="text-xl font-black text-white/90">R$ {p.price.toFixed(2)}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase"><Hourglass size={12} className="text-[#E11D48]" /> Prazo: {p.production_days} dias</div>
                  <button onClick={() => { setCart([...cart, { ...p, selectedSize: 'M', quantity: p.min_order }]); showToast("Adicionado!"); }} className="mt-6 w-full font-black py-4 rounded-2xl bg-white text-zinc-950 uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-all">Adicionar ({p.min_order} un)</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <button onClick={() => window.open(`https://wa.me/5517992198086`, '_blank')} className="fixed bottom-8 right-8 w-16 h-16 bg-zinc-900 border border-white/10 text-emerald-500 rounded-full shadow-2xl flex items-center justify-center z-[90] hover:scale-110 transition-transform"><MessageCircle size={32} /></button>
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 z-[110] w-full max-w-md glass flex flex-col border-l border-white/10">
              <div className="p-8 border-b border-white/5 flex items-center justify-between"><h2 className="text-2xl font-black uppercase tracking-tighter">Sua Lista</h2><button onClick={() => setIsCartOpen(false)}><X size={24} /></button></div>
              <div className="flex-1 p-8 space-y-6 overflow-y-auto">
                {cart.length === 0 ? <p className="text-center py-20 uppercase font-black text-xs text-zinc-600">O carrinho está vazio</p> : cart.map((item, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-zinc-950/40 rounded-3xl border border-white/5">
                    <img src={item.image_url} className="w-16 h-16 object-cover rounded-xl" alt="" />
                    <div className="flex-1">
                      <div className="flex justify-between items-start"><h4 className="text-[10px] font-bold text-white line-clamp-1">{item.name}</h4><button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-rose-500"><X size={14}/></button></div>
                      <p className="text-[10px] text-[#E11D48] font-black mt-1">{item.quantity} unidades</p>
                    </div>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-zinc-950/80 space-y-4">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <span className="text-[10px] font-black uppercase text-zinc-500">Total Estimado</span>
                    <span className="text-lg font-black text-white">R$ {cart.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}</span>
                  </div>
                  <button onClick={() => { 
                    let msg = `Olá! Unidade *${currentUser?.unit_name || 'Loja'}* (*${currentUser?.network_tag || 'Geral'}*):\n\n` + cart.map(i => `• ${i.name} - ${i.quantity}un`).join('\n');
                    window.open(`https://wa.me/5517992198086?text=${encodeURIComponent(msg)}`, '_blank');
                  }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-600/20">Finalizar no WhatsApp</button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
