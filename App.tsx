
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, Hourglass, Loader2, 
  UserPlus, LogIn, ShieldCheck, TrendingUp, DollarSign, Package, PlusCircle, 
  Trash2, Image as ImageIcon, MessageCircle, QrCode, Bell, LayoutGrid, List
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, CartItem, Size, User as UserType } from './types';
import { supabase } from './supabaseClient';

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
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authFlow, setAuthFlow] = useState<'initial' | 'admin' | 'client'>('initial');
  const [formData, setFormData] = useState({ 
    email: '', password: '', unit_name: '', network_tag: 'drogaria-total', role: 'user' as 'user' | 'admin', adminKey: '' 
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', 
    description: '', min_order: '10', production_days: '15'
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const validateSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          const user: UserType = {
            id: session.user.id,
            email: session.user.email!,
            unit_name: profile.unit_name,
            network_tag: profile.network_tag,
            role: profile.role
          };
          setCurrentUser(user);
          localStorage.setItem('tiquinho_session', JSON.stringify(user));
        }
      } else {
        localStorage.removeItem('tiquinho_session');
      }
      
      setIsLoading(false);
    };
    
    validateSession();
    
    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setCurrentUser(null);
        localStorage.removeItem('tiquinho_session');
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          const user: UserType = {
            id: session.user.id,
            email: session.user.email!,
            unit_name: profile.unit_name,
            network_tag: profile.network_tag,
            role: profile.role
          };
          setCurrentUser(user);
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const fetchInitialData = async () => {
    if (!currentUser) return;
    try {
      let query = supabase.from('products').select('*').order('name');
      const { data } = await query;
      if (data) setProducts(data);
    } catch (err) { console.error('Sync error:', err); }
  };

  useEffect(() => { fetchInitialData(); }, [currentUser]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
      });
      
      if (authError) throw authError;
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();
      
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

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const payload = {
      name: newProduct.name,
      description: newProduct.description,
      price: parseFloat(newProduct.price),
      image_url: newProduct.image_url,
      network_tag: newProduct.network_tag.toLowerCase().trim(),
      category: newProduct.category,
      min_order: parseInt(newProduct.min_order),
      production_days: parseInt(newProduct.production_days)
    };
    try {
      if (editingId) await supabase.from('products').update(payload).eq('id', editingId);
      else await supabase.from('products').insert([payload]);
      
      const rede = newProduct.network_tag.replace('-', ' ').toUpperCase();
      showToast(editingId ? "Produto atualizado com sucesso!" : `Produto publicado e rede ${rede} notificada!`);
      
      await fetchInitialData();
      setEditingId(null);
      setNewProduct({ name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', description: '', min_order: '10', production_days: '15' });
    } catch (err) { showToast("Erro ao salvar", "error"); }
    finally { setIsLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem('tiquinho_session');
  };

  const filteredProducts = useMemo(() => {
    if (currentUser?.role === 'admin') return products;
    return products.filter(p => p.network_tag === currentUser?.network_tag);
  }, [products, currentUser]);

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

          {authFlow === 'admin' && (
            <motion.div key="admin" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-md z-10">
              <button onClick={() => { setAuthFlow('initial'); setIsSigningUp(false); }} className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Voltar</button>
              <div className="flex flex-col items-center mb-10"><div className="w-16 h-16 bg-[#E11D48]/10 rounded-2xl flex items-center justify-center mb-4"><ShieldCheck className="text-[#E11D48]" size={32} /></div><h1 className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em]">Painel Gestor</h1></div>
              <div className="glass p-10 rounded-[40px] shadow-2xl">
                <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? 'Criar Conta Gestor' : 'Login Gestor'}</h2>
                <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
                  {isSigningUp && (<><input type="text" placeholder="Nome da Empresa/Rede" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required /><div className="relative"><input type="password" placeholder="Chave de Acesso Administrativa" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} className="w-full bg-zinc-900/50 border border-[#E11D48]/20 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required /><p className="text-[9px] text-zinc-600 mt-2 font-medium uppercase tracking-wider">* Solicite a chave com a equipe Tiquinho</p></div></>)}
                  <input type="email" placeholder="E-mail Administrativo" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                  <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                  <button type="submit" disabled={isLoading} className="w-full bg-[#E11D48] text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-rose-600/20 hover:bg-[#BE123C] transition-colors disabled:opacity-50">{isLoading ? 'PROCESSANDO...' : (isSigningUp ? 'CRIAR CONTA GESTOR' : 'ACESSAR PAINEL')}</button>
                </form>
                <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase hover:text-white transition-colors">{isSigningUp ? 'Já tenho conta de gestor' : 'Criar nova conta gestor'}</button>
              </div>
            </motion.div>
          )}

          {authFlow === 'client' && (
            <motion.div key="client" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-md z-10">
              <button onClick={() => { setAuthFlow('initial'); setIsSigningUp(false); }} className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Voltar</button>
              <div className="flex flex-col items-center mb-10"><div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4"><ShoppingCart className="text-emerald-500" size={32} /></div><h1 className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em]">Portal Cliente</h1></div>
              <div className="glass p-10 rounded-[40px] shadow-2xl">
                <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? 'Criar Conta Corporativa' : 'Login Corporativo'}</h2>
                <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
                  {isSigningUp && (<><input type="text" placeholder="Nome da Unidade/Franquia" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required /><select value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm appearance-none cursor-pointer"><option value="drogaria-total">Drogaria Total</option><option value="farmacia-abc">Farmácia ABC</option><option value="generica">Rede Independente</option></select></>)}
                  <input type="email" placeholder="E-mail Corporativo" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                  <input type="password" placeholder="Senha" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white text-sm placeholder:text-zinc-600" required />
                  <button type="submit" disabled={isLoading} className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-emerald-600/20 hover:bg-emerald-600 transition-colors disabled:opacity-50">{isLoading ? 'PROCESSANDO...' : (isSigningUp ? 'CRIAR CONTA' : 'ACESSAR CATÁLOGO')}</button>
                </form>
                <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase hover:text-white transition-colors">{isSigningUp ? 'Já tenho conta' : 'Criar nova conta corporativa'}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // --- ADMIN VIEW (JÉSSICA) ---
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
                <div><span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Receita Confirmada (PIX)</span><h4 className="text-3xl font-black text-white">R$ 75,00</h4></div>
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
              
              {/* COLUNA ESQUERDA - FOTO */}
              <div className="lg:col-span-4 flex flex-col gap-2">
                 <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Fotografia do Produto</span>
                 <div onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] bg-zinc-950 border border-white/5 rounded-[32px] flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48]/30 overflow-hidden relative group transition-all">
                  {newProduct.image_url ? (
                    <img src={newProduct.image_url} className="absolute inset-0 w-full h-full object-cover" /> 
                  ) : (
                    <div className="text-zinc-700 text-center group-hover:text-zinc-500 transition-colors">
                      <ImageIcon className="mx-auto mb-3 w-10 h-10 stroke-1" />
                      <p className="text-[9px] font-black uppercase tracking-widest">Upload de Imagem</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="text-[9px] font-black uppercase text-white tracking-widest">Alterar Foto</p>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setNewProduct({...newProduct, image_url: reader.result as string});
                      reader.readAsDataURL(file);
                    }
                  }} className="hidden" accept="image/*" />
                </div>
              </div>

              {/* COLUNA DIREITA - DADOS */}
              <div className="lg:col-span-8 space-y-6">
                <div>
                  <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Título do Uniforme *</label>
                  <input type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors placeholder:text-zinc-800" required />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Preço Unitário (R$)</label>
                    <input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors" required />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Pedido Mínimo (Unidades)</label>
                    <div className="relative">
                      <input type="number" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none transition-colors text-center font-bold" required />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none"><Package size={14} className="text-[#E11D48]" /></div>
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Grade de Tamanhos Disponíveis *</label>
                   <div className="flex gap-2 mb-2">
                     {['P', 'M', 'G', 'GG', 'XG'].map(size => (
                       <div key={size} className="flex-1 bg-zinc-950 border border-white/5 py-3 rounded-xl text-center text-xs font-bold text-zinc-400 cursor-not-allowed opacity-50">{size}</div>
                     ))}
                   </div>
                   <div className="bg-zinc-950 border border-white/5 py-3 rounded-xl text-center text-xs font-bold text-zinc-400 cursor-not-allowed opacity-50 w-full">Único</div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Prazo de Confecção</label>
                    <div className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm font-bold flex items-center justify-between">
                       <span>{newProduct.production_days} dias úteis</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Rede Franqueada *</label>
                    <select value={newProduct.network_tag} onChange={e => setNewProduct({...newProduct, network_tag: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm focus:border-[#E11D48]/50 focus:outline-none appearance-none font-bold">
                      <option value="drogaria-total">Drogaria Total</option>
                      <option value="farmacia-abc">Farmácia ABC</option>
                      <option value="generica">Uso Geral</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="w-full bg-[#E11D48] hover:bg-[#be123c] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-600/20 mt-4 transition-all flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} /> {editingId ? 'Salvar Alterações' : 'Publicar e Notificar Rede'}
                </button>
              </div>
            </form>
          </section>

          {/* LISTAGEM DE PRODUTOS */}
          <section className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2"><LayoutGrid className="text-[#E11D48]" /> Controle de Catálogo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900/30 p-4 rounded-[32px] border border-white/5 group hover:border-white/10 transition-colors flex items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-zinc-950 shrink-0 border border-white/5">
                    <img src={p.image_url} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-bold text-white truncate uppercase tracking-tight mb-1">{p.name}</h4>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">{p.network_tag}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-[#E11D48]">R$ {p.price.toFixed(2)}</span>
                      <span className="text-[9px] font-bold text-zinc-600 bg-zinc-950 px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1"><Package size={10} /> MÍN: {p.min_order} UN</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { 
                        setEditingId(p.id); 
                        setNewProduct({
                          name: p.name,
                          price: p.price.toString(),
                          image_url: p.image_url,
                          network_tag: p.network_tag,
                          category: p.category,
                          description: p.description || '',
                          min_order: p.min_order.toString(),
                          production_days: p.production_days.toString()
                        }); 
                        window.scrollTo({ top: 400, behavior: 'smooth' }); 
                      }} className="flex-1 bg-zinc-800/80 hover:bg-zinc-800 py-2 rounded-xl text-[9px] uppercase font-black text-zinc-300 flex items-center justify-center gap-1 transition-colors"><MessageCircle size={10} className="rotate-90" /> Editar</button>
                      <button onClick={async () => { if(confirm("Excluir?")) { await supabase.from('products').delete().eq('id', p.id); fetchInitialData(); } }} className="w-8 h-8 flex items-center justify-center bg-rose-950/30 text-rose-500 rounded-xl hover:bg-rose-950/50 transition-colors"><Trash2 size={14}/></button>
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
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Unidade / Rede</th>
                        <th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Valor Total</th>
                        <th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500">Status</th>
                        <th className="p-6 text-[9px] font-black uppercase tracking-widest text-zinc-500 text-right">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-6">
                          <p className="text-sm font-bold text-white">Unidade Matriz</p>
                          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Drogaria Total</p>
                        </td>
                        <td className="p-6">
                          <p className="text-sm font-black text-[#E11D48]">R$ 75.00</p>
                        </td>
                        <td className="p-6">
                           <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Pago/Aguardando Produção</span>
                        </td>
                        <td className="p-6 text-right">
                          <p className="text-xs font-bold text-zinc-400">08/01/2026</p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
             </div>
          </section>

        </main>
      </div>
    );
  }

  // --- USER VIEW (FRANQUEADO) ---
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="h-8 w-px bg-white/10 hidden md:block" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hidden md:block">
            {currentUser?.unit_name}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-3 text-zinc-500 relative hover:text-white transition-colors">
            <Bell size={20} />
            <span className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-rose-500/50" />
          </button>
          <button onClick={() => setIsCartOpen(true)} className="relative p-3 bg-zinc-900/50 rounded-2xl border border-white/5">
            <ShoppingCart size={20} />
            {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-[#E11D48] text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-lg shadow-rose-600/50">{cart.length}</span>}
          </button>
          <button onClick={handleLogout} className="p-3 text-zinc-500 hover:text-rose-500"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase">{currentUser?.unit_name}</h1>
            <p className="text-zinc-500 font-black uppercase tracking-[0.2em] text-[10px] mt-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Rede: {currentUser?.network_tag?.replace('-', ' ')}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {filteredProducts.map(p => (
            <div key={p.id} className="bg-zinc-900/40 border border-white/5 rounded-[32px] overflow-hidden flex flex-col group shadow-2xl hover:border-[#E11D48]/30 transition-all">
              <div className="aspect-square bg-zinc-950 overflow-hidden relative">
                <img src={p.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                  <p className="text-[10px] text-zinc-300 font-medium line-clamp-3">{p.description}</p>
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-base font-bold text-white mb-1 line-clamp-1">{p.name}</h3>
                <p className="text-xl font-black text-[#E11D48]">R$ {p.price.toFixed(2)}</p>
                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase"><Hourglass size={12} className="text-[#E11D48]" /> Confecção: {p.production_days} dias</div>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase"><Package size={12} className="text-[#E11D48]" /> Mínimo: {p.min_order} un</div>
                </div>
                <button onClick={() => { setCart([...cart, { ...p, selectedSize: 'M', quantity: p.min_order }]); showToast("Adicionado!"); }} className="mt-6 w-full font-black py-4 rounded-2xl bg-white text-zinc-950 uppercase text-[10px] tracking-widest hover:bg-[#E11D48] hover:text-white transition-all">
                  Comprar ({p.min_order} un)
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      <button onClick={() => window.open(`https://wa.me/5517992198086`, '_blank')} className="fixed bottom-8 right-8 w-16 h-16 bg-[#25D366] text-white rounded-full shadow-2xl flex items-center justify-center z-[90] hover:scale-110 transition-transform shadow-emerald-500/20">
        <MessageCircle size={32} />
      </button>

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
                      <h4 className="text-[10px] font-bold text-white line-clamp-1 uppercase">{item.name}</h4>
                      <p className="text-xs font-black text-[#E11D48] mt-1">{item.quantity} un</p>
                    </div>
                    <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-rose-500"><X size={16}/></button>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-zinc-950/80 space-y-4">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <span className="text-[10px] font-black uppercase text-zinc-500">Subtotal</span>
                    <span className="text-xl font-black text-white">R$ {cart.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => showToast("Pagamento via PIX disponível no checkout final.", "success")} className="bg-white/5 text-white py-4 rounded-2xl font-black uppercase text-[9px] flex items-center justify-center gap-2 border border-white/10 tracking-widest">
                      <QrCode size={14}/> PIX
                    </button>
                    <button onClick={() => { 
                      let msg = `*Pedido Tiquinho Corporate*\n\nUnidade: *${currentUser?.unit_name}*\nRede: *${currentUser?.network_tag}*\n\n` + cart.map(i => `• ${i.name} - ${i.quantity}un`).join('\n') + `\n\nTotal: R$ ${cart.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}`;
                      window.open(`https://wa.me/5517992198086?text=${encodeURIComponent(msg)}`, '_blank');
                    }} className="bg-[#25D366] text-white py-4 rounded-2xl font-black uppercase text-[9px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 tracking-widest">
                      <MessageCircle size={14}/> FINALIZAR
                    </button>
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
