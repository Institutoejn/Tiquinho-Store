
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, Minus, X, CheckCircle2, AlertCircle, Package, ArrowRight, 
  BarChart3, PlusCircle, Bell, Trash2, DollarSign, TrendingUp, LayoutGrid, Image as ImageIcon, 
  Pencil, Info, ChevronRight, MessageCircle, QrCode, Clock, ClipboardList, Calendar, Hourglass, Loader2, UserPlus, LogIn, ShieldCheck
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
  <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center">
    <div className="bg-zinc-900 p-8 rounded-[32px] border border-white/5 flex flex-col items-center gap-4 shadow-2xl">
      <Loader2 className="w-10 h-10 text-[#E11D48] animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Sincronizando...</p>
    </div>
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

const ProductCard: React.FC<{ product: Product, onAddToCart: (p: Product, s: Size) => void }> = ({ product, onAddToCart }) => {
  const sizes: Size[] = (product.available_sizes && product.available_sizes.length > 0) ? product.available_sizes : ['P', 'M', 'G', 'GG'];
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  
  return (
    <motion.div whileHover={{ y: -8 }} className="bg-zinc-900/40 border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-md flex flex-col group shadow-xl transition-all max-w-sm mx-auto w-full">
      <div className="relative aspect-square bg-zinc-950 overflow-hidden">
        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700" />
        <div className="absolute top-4 left-4">
          <span className="bg-zinc-900/60 backdrop-blur-xl text-white text-[10px] font-extrabold px-3 py-1.5 rounded-full border border-white/10 uppercase">{product.category || 'Uniforme'}</span>
        </div>
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <h3 className="text-base font-bold text-white mb-1 tracking-tight group-hover:text-[#E11D48] transition-colors line-clamp-1">{product.name}</h3>
        <p className="text-xl font-black text-white/90">R$ {product.price.toFixed(2)}</p>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase"><Hourglass size={12} className="text-[#E11D48]" /> Prazo: {product.production_days} dias</div>
        
        <div className="my-5 space-y-3">
          <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase"><span>Tamanho</span><span>Mín: {product.min_order} un</span></div>
          <div className="flex flex-wrap gap-2">{sizes.map(size => (
            <button key={size} onClick={() => setSelectedSize(size)} className={`px-2 py-2 min-w-[2.5rem] rounded-xl text-[10px] font-black transition-all border ${selectedSize === size ? 'bg-[#E11D48] border-[#E11D48] text-white' : 'bg-zinc-800/50 border-white/5 text-zinc-500 hover:text-zinc-300'}`}>{size}</button>
          ))}</div>
        </div>
        
        <button disabled={!selectedSize} onClick={() => selectedSize && onAddToCart(product, selectedSize)} className={`w-full font-black py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest ${selectedSize ? 'bg-white text-zinc-950' : 'bg-zinc-800 text-zinc-600 opacity-50'}`}>
          <Plus size={16} strokeWidth={3} /> {selectedSize ? `Adicionar (${product.min_order} un)` : 'Selecione o Tamanho'}
        </button>
      </div>
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
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] as Size[] 
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- PERSISTÊNCIA E INICIALIZAÇÃO ---
  useEffect(() => {
    const saved = localStorage.getItem('tiquinho_session');
    if (saved) setCurrentUser(JSON.parse(saved));
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      if (data) setProducts(data);
    } catch (err) { console.error('Load Error:', err); }
    finally { setIsLoading(false); }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const saveSession = (user: UserType) => {
    setCurrentUser(user);
    localStorage.setItem('tiquinho_session', JSON.stringify(user));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').eq('email', formData.email).eq('password', formData.password).single();
      if (error || !data) throw new Error('Credenciais não encontradas.');
      saveSession(data);
      showToast(`Olá, ${data.unit_name}!`);
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setIsLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (formData.role === 'admin' && formData.adminKey !== 'TIQUINHO2026') {
      showToast("Chave Administrativa inválida.", "error");
      setIsLoading(false);
      return;
    }

    try {
      const newUser = { 
        email: formData.email, 
        password: formData.password, 
        unit_name: formData.unit_name, 
        network_tag: formData.role === 'admin' ? 'admin' : formData.network_tag, 
        role: formData.role 
      };
      const { data, error } = await supabase.from('users').insert([newUser]).select().single();
      if (error) {
        if (error.code === '23505') throw new Error('E-mail já cadastrado.');
        throw error;
      }
      saveSession(data);
      showToast("Bem-vindo ao Portal!");
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setIsLoading(false); }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCart([]);
    localStorage.removeItem('tiquinho_session');
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const payload = {
      name: newProduct.name,
      price: parseFloat(newProduct.price),
      image_url: newProduct.image_url,
      network_tag: newProduct.network_tag,
      category: newProduct.category,
      min_order: parseInt(newProduct.min_order),
      production_days: parseInt(newProduct.production_days),
      available_sizes: newProduct.available_sizes
    };

    try {
      if (editingId) {
        await supabase.from('products').update(payload).eq('id', editingId);
        showToast("Uniforme atualizado.");
      } else {
        await supabase.from('products').insert([payload]);
        showToast("Novo uniforme publicado.");
      }
      fetchInitialData();
      setEditingId(null);
      setNewProduct({ name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', description: '', min_order: '10', production_days: '15', available_sizes: [] });
    } catch (err) { showToast("Erro ao salvar.", "error"); }
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

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cart]);

  // --- RENDERS ---

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {isLoading && <Spinner />}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#E11D48]/10 rounded-full blur-[120px]" />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-md z-10">
          <div className="flex flex-col items-center mb-10"><Logo className="w-20 h-20 mb-6" /><p className="text-zinc-500 text-xs font-black uppercase tracking-[0.3em]">Tiquinho Store</p></div>
          
          <div className="glass p-10 rounded-[40px] shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? 'Cadastro Corporativo' : 'Acesso Restrito'}</h2>
            
            <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-5">
              {isSigningUp && (
                <div className="space-y-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Tipo de Acesso</label>
                    <div className="relative flex p-1 bg-zinc-950 rounded-2xl border border-white/5">
                      <motion.div className="absolute inset-y-1 bg-[#E11D48] rounded-xl shadow-lg" animate={{ x: formData.role === 'admin' ? '100%' : '0%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }} style={{ width: 'calc(50% - 4px)' }} />
                      <button type="button" onClick={() => setFormData({...formData, role: 'user'})} className={`relative z-10 flex-1 py-2 text-[10px] font-black uppercase transition-colors ${formData.role === 'user' ? 'text-white' : 'text-zinc-500'}`}>Franqueado</button>
                      <button type="button" onClick={() => setFormData({...formData, role: 'admin'})} className={`relative z-10 flex-1 py-2 text-[10px] font-black uppercase transition-colors ${formData.role === 'admin' ? 'text-white' : 'text-zinc-500'}`}>Gestor</button>
                    </div>
                  </div>
                  {formData.role === 'admin' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-[#E11D48] ml-1 flex items-center gap-1"><ShieldCheck size={12}/> Chave Admin</label>
                      <input type="password" value={formData.adminKey} onChange={e => setFormData({...formData, adminKey: e.target.value})} placeholder="Código de Segurança" className="w-full bg-[#E11D48]/5 border border-[#E11D48]/20 p-4 rounded-2xl text-white focus:ring-[#E11D48]" required />
                    </motion.div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Nome da Unidade / Loja</label>
                    <input type="text" value={formData.unit_name} onChange={e => setFormData({...formData, unit_name: e.target.value})} placeholder="Ex: Matriz Centro" className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white" required />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">E-mail</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="exemplo@loja.com" className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white" required />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Senha</label>
                <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="••••••••" className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white" required />
              </div>

              {isSigningUp && formData.role === 'user' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Rede / Franquia</label>
                  <select value={formData.network_tag} onChange={e => setFormData({...formData, network_tag: e.target.value})} className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white appearance-none">
                    <option value="drogaria-total">Drogaria Total</option>
                    <option value="farmacia-abc">Farmácia ABC</option>
                    <option value="generica">Rede Independente</option>
                  </select>
                </div>
              )}

              <motion.button whileTap={{ scale: 0.98 }} type="submit" className="w-full bg-[#E11D48] text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 uppercase text-xs tracking-widest shadow-xl shadow-rose-600/20">
                {isSigningUp ? <UserPlus size={18} /> : <LogIn size={18} />} {isSigningUp ? 'Finalizar Cadastro' : 'Entrar no Portal'}
              </motion.button>
            </form>
            
            <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">
              {isSigningUp ? 'Voltar para Login' : 'Criar Nova Conta'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- VIEW ADMIN ---
  if (currentUser.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100">
        {isLoading && <Spinner />}
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        
        <header className="sticky top-0 z-50 glass px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4"><Logo /><h2 className="text-xs font-black uppercase tracking-widest">Painel Administrativo</h2></div>
          <button onClick={handleLogout} className="p-3 bg-zinc-800 rounded-2xl text-zinc-400 hover:text-[#E11D48] transition-all"><LogOut size={20} /></button>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
          <section className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-8">
            <h2 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tighter"><PlusCircle className="text-[#E11D48]" /> {editingId ? 'Editar Uniforme' : 'Novo Uniforme'}</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <input type="text" placeholder="Nome do Produto" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white" required />
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="0.01" placeholder="Preço (R$)" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white" required />
                  <input type="number" placeholder="Mínimo (un)" value={newProduct.min_order} onChange={e => setNewProduct({...newProduct, min_order: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" placeholder="Prazo (dias)" value={newProduct.production_days} onChange={e => setNewProduct({...newProduct, production_days: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white" required />
                  <select value={newProduct.network_tag} onChange={e => setNewProduct({...newProduct, network_tag: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white">
                    <option value="drogaria-total">Drogaria Total</option>
                    <option value="farmacia-abc">Farmácia ABC</option>
                    <option value="generica">Uso Geral</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <div onClick={() => fileInputRef.current?.click()} className="h-full min-h-[160px] bg-zinc-950 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48]/30 transition-all overflow-hidden relative">
                  {newProduct.image_url ? <img src={newProduct.image_url} className="absolute inset-0 w-full h-full object-cover" /> : <div className="text-zinc-600 text-center"><ImageIcon className="mx-auto mb-2" size={32} /><p className="text-[10px] font-black uppercase">Clique para Foto</p></div>}
                  <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                </div>
              </div>
              <button type="submit" className="md:col-span-2 bg-[#E11D48] py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-rose-600/20">{editingId ? 'Salvar Alterações' : 'Publicar Uniforme'}</button>
            </form>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {products.map(p => (
              <div key={p.id} className="bg-zinc-900/50 p-4 rounded-[32px] flex flex-col gap-3 group border border-white/5">
                <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-950">
                  <img src={p.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt="" />
                </div>
                <h4 className="text-[10px] font-bold truncate text-zinc-300">{p.name}</h4>
                <div className="flex gap-2">
                  <button onClick={() => { 
                    setEditingId(p.id); 
                    setNewProduct({ 
                      name: p.name, price: p.price.toString(), image_url: p.image_url, 
                      network_tag: p.network_tag, category: p.category, description: p.description || '', 
                      min_order: p.min_order.toString(), production_days: p.production_days.toString(), available_sizes: p.available_sizes || [] 
                    }); 
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }} className="flex-1 bg-zinc-800 py-2 rounded-xl text-[9px] uppercase font-black">Editar</button>
                  <button onClick={async () => {
                    if(confirm("Excluir modelo?")) {
                      setIsLoading(true);
                      await supabase.from('products').delete().eq('id', p.id);
                      fetchInitialData();
                    }
                  }} className="p-2 bg-rose-600/10 text-rose-500 rounded-xl"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    );
  }

  // --- VIEW USER ---
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {isLoading && <Spinner />}
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      
      <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
        <Logo />
        <div className="flex gap-3">
          <button onClick={() => setIsCartOpen(true)} className="relative p-3 bg-zinc-900/50 rounded-2xl border border-white/5 transition-all hover:bg-zinc-800">
            <ShoppingCart size={20} />
            {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-[#E11D48] text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-lg shadow-rose-600/40">{cart.length}</span>}
          </button>
          <button onClick={handleLogout} className="p-3 text-zinc-500 hover:text-[#E11D48] transition-colors"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-black mb-1 tracking-tighter uppercase">{currentUser.unit_name}</h1>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            <p className="text-zinc-500 font-black uppercase tracking-widest text-[10px]">Rede: {currentUser.network_tag.replace('-', ' ')}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.filter(p => p.network_tag === currentUser.network_tag || p.network_tag === 'generica').map(p => (
            <ProductCard key={p.id} product={p} onAddToCart={(prod, size) => { 
              setCart([...cart, { ...prod, selectedSize: size, quantity: prod.min_order }]); 
              showToast("Adicionado!"); 
            }} />
          ))}
        </div>
      </main>

      {/* Botão de Suporte WhatsApp */}
      <button onClick={() => window.open(`https://wa.me/5517992198086`, '_blank')} className="fixed bottom-8 right-8 w-16 h-16 bg-zinc-900 border border-white/10 text-emerald-500 rounded-full shadow-2xl flex items-center justify-center z-[90] hover:scale-110 transition-transform"><MessageCircle size={32} /></button>

      {/* Drawer Carrinho */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 z-[110] w-full max-w-md glass flex flex-col border-l border-white/10">
              <div className="p-8 border-b border-white/5 flex items-center justify-between"><h2 className="text-2xl font-black uppercase tracking-tighter">Minha Lista</h2><button onClick={() => setIsCartOpen(false)}><X size={24} /></button></div>
              
              <div className="flex-1 p-8 space-y-6 overflow-y-auto">
                {cart.length === 0 ? <div className="text-center py-20 opacity-20"><ShoppingCart size={48} className="mx-auto mb-4" /><p className="uppercase font-black text-xs">Vazio</p></div> : cart.map((item, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-zinc-950/40 rounded-3xl border border-white/5">
                    <img src={item.image_url} className="w-16 h-16 object-cover rounded-xl" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start"><h4 className="text-[10px] font-bold text-white truncate">{item.name}</h4><button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-rose-500"><X size={14}/></button></div>
                      <p className="text-[10px] text-rose-500 font-black mt-1">{item.selectedSize} | {item.quantity} un</p>
                      <p className="text-[11px] font-black text-white mt-1">R$ {(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {cart.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-zinc-950/80 space-y-4">
                  <div className="flex justify-between font-black text-xl uppercase"><span>Total</span><span className="text-[#E11D48]">R$ {cartTotal.toFixed(2)}</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => showToast("Escaneie no App de Banco", "success")} className="bg-white text-zinc-950 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2"><QrCode size={16}/> PIX</button>
                    <button onClick={() => { 
                      let msg = `Olá! Sou da unidade *${currentUser.unit_name}* e gostaria de fechar este pedido:\n\n` + cart.map(i => `• ${i.name} (${i.selectedSize}) - ${i.quantity}un`).join('\n') + `\n\n*Total: R$ ${cartTotal.toFixed(2)}*`;
                      window.open(`https://wa.me/5517992198086?text=${encodeURIComponent(msg)}`, '_blank');
                    }} className="bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"><MessageCircle size={16}/> WhatsApp</button>
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
