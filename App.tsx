
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, LogOut, Plus, X, CheckCircle2, AlertCircle, Hourglass, Loader2, 
  UserPlus, LogIn, ShieldCheck, TrendingUp, DollarSign, Package, PlusCircle, 
  Trash2, Image as ImageIcon, MessageCircle, QrCode, Bell
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
      const saved = localStorage.getItem('tiquinho_session');
      if (saved) {
        try {
          const user = JSON.parse(saved);
          const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
          if (data) setCurrentUser(data);
          else localStorage.removeItem('tiquinho_session');
        } catch (e) { localStorage.removeItem('tiquinho_session'); }
      }
      setIsLoading(false);
    };
    validateSession();
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
      const { data, error } = await supabase.from('users').select('*').eq('email', formData.email.toLowerCase().trim()).eq('password', formData.password).single();
      if (error || !data) throw new Error('Credenciais inválidas.');
      setCurrentUser(data);
      localStorage.setItem('tiquinho_session', JSON.stringify(data));
      showToast(`Olá, ${data.unit_name}!`);
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setIsLoading(false); }
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
      const newUser = { 
        email: formData.email.toLowerCase().trim(), 
        password: formData.password, 
        unit_name: formData.unit_name, 
        network_tag: formData.role === 'admin' ? 'admin' : formData.network_tag, 
        role: formData.role 
      };
      const { data, error } = await supabase.from('users').insert([newUser]).select().single();
      if (error) throw error;
      setCurrentUser(data);
      localStorage.setItem('tiquinho_session', JSON.stringify(data));
    } catch (err: any) { showToast("Erro no cadastro", "error"); }
    finally { setIsLoading(false); }
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
      
      showToast("Catálogo atualizado!");
      await fetchInitialData();
      setEditingId(null);
      setNewProduct({ name: '', price: '', image_url: '', network_tag: 'drogaria-total', category: 'Masculino', description: '', min_order: '10', production_days: '15' });
    } catch (err) { showToast("Erro ao salvar", "error"); }
    finally { setIsLoading(false); }
  };

  const handleLogout = () => { setCurrentUser(null); localStorage.removeItem('tiquinho_session'); };

  const filteredProducts = useMemo(() => {
    if (currentUser?.role === 'admin') return products;
    return products.filter(p => p.network_tag === currentUser?.network_tag);
  }, [products, currentUser]);

  if (isLoading && !currentUser) return <Spinner />;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#E11D48]/10 rounded-full blur-[120px]" />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10">
          <div className="flex flex-col items-center mb-10"><Logo className="w-20 h-20 mb-4" /><h1 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em]">Tiquinho Corporate</h1></div>
          <div className="glass p-10 rounded-[40px] shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-tighter">{isSigningUp ? 'Acesso Novo' : 'Login Corporativo'}</h2>
            <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-4">
              {isSigningUp && (
                <div className="space-y-4 mb-4">
                  <div className="flex p-1 bg-zinc-950 rounded-2xl border border-white/5 relative">
                    <motion.div className="absolute inset-y-1 bg-[#E11D48] rounded-xl" animate={{ x: formData.role === 'admin' ? '100%' : '0%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }} style={{ width: 'calc(50% - 4px)' }} />
                    <button type="button" onClick={() => setFormData({...formData, role: 'user'})} className={`relative z-10 flex-1 py-2 text-[10px] font-black uppercase ${formData.role === 'user' ? 'text-white' : 'text-zinc-500'}`}>Franqueado</button>
                    <button type="button" onClick={() => setFormData({...formData, role: 'admin'})} className={`relative z-10 flex-1 py-2 text-[10px] font-black uppercase ${formData.role === 'admin' ? 'text-white' : 'text-zinc-500'}`}>Gestor</button>
                  </div>
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
              <button type="submit" className="w-full bg-[#E11D48] text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-rose-600/20">
                {isSigningUp ? 'Finalizar Cadastro' : 'Entrar no Portal'}
              </button>
            </form>
            <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-6 text-zinc-600 text-[10px] font-black uppercase hover:text-white transition-colors">
              {isSigningUp ? 'Já tenho conta' : 'Criar Conta Corporativa'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- ADMIN VIEW (JÉSSICA) ---
  if (currentUser?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-20">
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3"><Logo /><h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Painel Jéssica</h2></div>
          <button onClick={handleLogout} className="p-3 bg-zinc-800 rounded-2xl text-zinc-400 hover:text-[#E11D48]"><LogOut size={20} /></button>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
          <section className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10">
            <h2 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tighter"><PlusCircle className="text-[#E11D48]" /> Gerenciar Uniformes</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Nome do Modelo" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm md:col-span-2" required />
                <textarea placeholder="Descrição detalhada do uniforme..." value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="w-full bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm md:col-span-2 min-h-[100px]" />
                <input type="number" step="0.01" placeholder="Preço (R$)" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm" required />
                <select value={newProduct.network_tag} onChange={e => setNewProduct({...newProduct, network_tag: e.target.value})} className="bg-zinc-950 border border-white/5 p-4 rounded-2xl text-white text-sm">
                  <option value="drogaria-total">Drogaria Total</option>
                  <option value="farmacia-abc">Farmácia ABC</option>
                  <option value="generica">Uso Geral</option>
                </select>
              </div>
              <div onClick={() => fileInputRef.current?.click()} className="min-h-[200px] bg-zinc-950 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#E11D48]/30 overflow-hidden relative">
                {newProduct.image_url ? <img src={newProduct.image_url} className="absolute inset-0 w-full h-full object-cover" /> : <div className="text-zinc-600 text-center"><ImageIcon className="mx-auto mb-2" /><p className="text-[10px] font-black uppercase">Adicionar Foto</p></div>}
                <input type="file" ref={fileInputRef} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setNewProduct({...newProduct, image_url: reader.result as string});
                    reader.readAsDataURL(file);
                  }
                }} className="hidden" accept="image/*" />
              </div>
              <button type="submit" className="md:col-span-3 bg-[#E11D48] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-600/20">
                {editingId ? 'Salvar Alterações' : 'Publicar no Catálogo'}
              </button>
            </form>
          </section>

          <section className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Catálogo Global</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900/40 p-4 rounded-[32px] border border-white/5 group">
                  <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-950 mb-3"><img src={p.image_url} className="w-full h-full object-cover" /></div>
                  <h4 className="text-[10px] font-bold text-zinc-300 truncate uppercase tracking-widest">{p.name}</h4>
                  <p className="text-xs font-black text-[#E11D48] mt-1">R$ {p.price.toFixed(2)}</p>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => { 
                      setEditingId(p.id); 
                      // Fix: Explicitly map properties and handle optional description to satisfy state types
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
                      window.scrollTo({ top: 100, behavior: 'smooth' }); 
                    }} className="flex-1 bg-zinc-800 py-2 rounded-xl text-[9px] uppercase font-black">Editar</button>
                    <button onClick={async () => { if(confirm("Excluir?")) { await supabase.from('products').delete().eq('id', p.id); fetchInitialData(); } }} className="p-2 bg-rose-600/10 text-rose-500 rounded-xl"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
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
