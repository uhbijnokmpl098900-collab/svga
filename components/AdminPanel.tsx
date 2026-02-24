
import React, { useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, query, orderBy, addDoc, serverTimestamp, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { UserRecord, ProcessLog, AppSettings, LicenseKey, SubscriptionType, PresetBackground, StoreProduct, StoreOrder } from '../types';
import { UserManagement } from './admin/UserManagement';
import { FeatureConfig } from './admin/FeatureConfig';
import { BrandingSettings } from './admin/BrandingSettings';

interface AdminPanelProps {
  currentUser?: UserRecord | null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'keys' | 'backgrounds' | 'branding' | 'logs' | 'store' | 'orders' | 'system'>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [logs, setLogs] = useState<ProcessLog[]>([]);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [backgrounds, setBackgrounds] = useState<PresetBackground[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [storeOrders, setStoreOrders] = useState<StoreOrder[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    appName: 'SVGA GENIUS',
    logoUrl: '',
    backgroundUrl: '',
    isRegistrationOpen: true,
    costs: { svgaProcess: 5, batchCompress: 20, vipPrice: 1000 }
  });

  // Store Product Form State
  const [newProdName, setNewProdName] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdPrice, setNewProdPrice] = useState(100);
  const [newProdCategory, setNewProdCategory] = useState('إطارات');
  const [newProdVideo, setNewProdVideo] = useState('');
  const [newProdImage, setNewProdImage] = useState('');
  const [newProdFormats, setNewProdFormats] = useState<string[]>(['MP4', 'SVGA']);
  const prodVideoFileRef = useRef<HTMLInputElement>(null);
  const prodImageFileRef = useRef<HTMLInputElement>(null);

  // Background Form State
  const [newBgLabel, setNewBgLabel] = useState('');
  const [newBgUrl, setNewBgUrl] = useState('');
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleFactoryReset = async () => {
    if (!confirm("تحذير هام: هل أنت متأكد تماماً من حذف جميع بيانات الموقع؟\n\nسيتم حذف:\n- جميع المستخدمين\n- جميع الطلبات\n- جميع المنتجات\n- جميع السجلات\n- جميع الأكواد\n\nلا يمكن التراجع عن هذه الخطوة!")) return;
    
    const confirmCode = prompt("للتأكيد، اكتب 'حذف' في المربع أدناه:");
    if (confirmCode !== 'حذف') return;

    setIsResetting(true);
    try {
      const deleteCollection = async (colName: string) => {
        const q = query(collection(db, colName));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      };

      await Promise.all([
        deleteCollection("users"),
        deleteCollection("store_orders"),
        deleteCollection("store_products"),
        deleteCollection("process_logs"),
        deleteCollection("license_keys"),
        deleteCollection("backgrounds")
      ]);

      alert("تم حذف جميع البيانات بنجاح.");
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء الحذف");
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) setSettings(docSnap.data() as AppSettings);
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserRecord[]);
    });

    const unsubKeys = onSnapshot(query(collection(db, "license_keys"), orderBy("createdAt", "desc")), (snapshot) => {
      setKeys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LicenseKey[]);
    });

    const unsubBgs = onSnapshot(query(collection(db, "backgrounds"), orderBy("createdAt", "desc")), (snapshot) => {
      setBackgrounds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PresetBackground[]);
    });

    const unsubStore = onSnapshot(query(collection(db, "store_products"), orderBy("createdAt", "desc")), (snapshot) => {
      setStoreProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StoreProduct[]);
    });

    const unsubOrders = onSnapshot(query(collection(db, "store_orders"), orderBy("createdAt", "desc")), (snapshot) => {
      setStoreOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StoreOrder[]);
    });

    const logsQuery = query(collection(db, "process_logs"), orderBy("timestamp", "desc"));
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProcessLog[]);
    });

    return () => { unsubSettings(); unsubUsers(); unsubLogs(); unsubKeys(); unsubBgs(); unsubStore(); unsubOrders(); };
  }, []);

  const addStoreProduct = async () => {
    if (!newProdName || !newProdVideo) return;
    await addDoc(collection(db, "store_products"), {
      name: newProdName,
      description: newProdDesc,
      price: newProdPrice,
      category: newProdCategory,
      videoUrl: newProdVideo,
      imageUrl: newProdImage,
      supportedFormats: newProdFormats,
      createdAt: serverTimestamp()
    });
    setNewProdName(''); setNewProdDesc(''); setNewProdVideo(''); setNewProdImage(''); setNewProdFormats(['MP4', 'SVGA']);
  };

  const updateOrderStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "store_orders", id), { status });
  };

  const deleteStoreProduct = async (id: string) => {
    if (confirm("حذف هذا المنتج؟")) await deleteDoc(doc(db, "store_products", id));
  };

  const generateKeys = async (duration: SubscriptionType, count: number) => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    for (let i = 0; i < count; i++) {
      const randomKey = Array.from({ length: 4 }, () => Math.random().toString(36).substring(2, 7).toUpperCase()).join('-');
      await addDoc(collection(db, "license_keys"), {
        key: randomKey,
        duration,
        isUsed: false,
        createdAt: serverTimestamp(),
        expiresAt: expiry
      });
    }
  };

  const addBackground = async (label: string, url: string) => {
    if (!label || !url) return;
    await addDoc(collection(db, "backgrounds"), {
      label,
      url,
      createdAt: serverTimestamp()
    });
    setNewBgLabel('');
    setNewBgUrl('');
  };

  const handleBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setNewBgUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const deleteBackground = async (id: string) => {
    if (confirm("هل تريد حذف هذه الخلفية؟")) {
      await deleteDoc(doc(db, "backgrounds", id));
    }
  };

  const deletePendingOrders = async () => {
    if (confirm("هل أنت متأكد من حذف جميع الطلبات المعلقة؟ (سيتم استثناء طلباتك)")) {
      const pendingOrders = storeOrders.filter(o => o.status === 'pending' && o.username !== currentUser?.name);
      for (const order of pendingOrders) {
        await deleteDoc(doc(db, "store_orders", order.id));
      }
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-700 font-arabic pb-20 text-right" dir="rtl">
      <div className="flex flex-wrap bg-slate-950 p-1 rounded-3xl border border-white/5 mb-8">
        {[
          { id: 'users', label: 'الأعضاء' },
          { id: 'keys', label: 'أكواد' },
          { id: 'store', label: 'المتجر' },
          { id: 'orders', label: 'الطلبات' },
          { id: 'backgrounds', label: 'الخلفيات' },
          { id: 'branding', label: 'الهوية' },
          { id: 'logs', label: 'السجلات' },
          { id: 'system', label: 'النظام' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-3 rounded-2xl text-[8px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-sky-500 text-white shadow-glow-sky' : 'text-slate-500 hover:text-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'users' && <UserManagement users={users} />}
        
        {activeTab === 'store' && (
          <div className="space-y-6">
            <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 space-y-4">
               <h4 className="text-white font-black text-xs uppercase tracking-widest">إضافة منتج جديد للمتجر</h4>
               <div className="space-y-3">
                  <input type="text" placeholder="اسم المنتج" value={newProdName} onChange={(e)=>setNewProdName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white outline-none" />
                  <textarea placeholder="وصف المنتج" value={newProdDesc} onChange={(e)=>setNewProdDesc(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white outline-none h-20" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-black uppercase mr-2">السعر</label>
                      <input type="number" placeholder="السعر ($)" value={newProdPrice} onChange={(e)=>setNewProdPrice(parseInt(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-black uppercase mr-2">القسم</label>
                      <select value={newProdCategory} onChange={(e)=>setNewProdCategory(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white outline-none appearance-none">
                        <option value="إطارات">إطارات</option>
                        <option value="خلفيات">خلفيات</option>
                        <option value="هدايا">هدايا</option>
                        <option value="أخرى">أخرى</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex gap-1">
                      <input type="text" placeholder="رابط الفيديو (MP4)" value={newProdVideo} onChange={(e)=>setNewProdVideo(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] text-white outline-none" />
                      <button onClick={() => prodVideoFileRef.current?.click()} className="px-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">📁</button>
                      <input type="file" ref={prodVideoFileRef} hidden onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setNewProdVideo(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} accept="video/mp4" />
                    </div>
                    <div className="flex gap-1">
                      <input type="text" placeholder="رابط صورة الغلاف" value={newProdImage} onChange={(e)=>setNewProdImage(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] text-white outline-none" />
                      <button onClick={() => prodImageFileRef.current?.click()} className="px-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">📁</button>
                      <input type="file" ref={prodImageFileRef} hidden onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setNewProdImage(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} accept="image/*" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 font-black uppercase">الصيغ المدعومة</label>
                    <div className="flex flex-wrap gap-2">
                      {['MP4', 'SVGA', 'GIF', 'WEBP', 'PNG', 'VAP'].map(f => (
                        <button 
                          key={f}
                          onClick={() => {
                            if (newProdFormats.includes(f)) setNewProdFormats(newProdFormats.filter(x => x !== f));
                            else setNewProdFormats([...newProdFormats, f]);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black border transition-all ${newProdFormats.includes(f) ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 text-slate-500 border-white/10'}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={addStoreProduct} className="w-full py-3 bg-sky-500 text-white rounded-xl text-[10px] font-black uppercase shadow-glow-sky">إضافة للمتجر</button>
               </div>
            </div>
            <div className="space-y-3">
               {storeProducts.map(p => (
                 <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       {p.imageUrl ? (
                         <img src={p.imageUrl} className="w-12 h-12 rounded-lg object-cover" />
                       ) : (
                         <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-[8px] text-slate-500">No Img</div>
                       )}
                       <div className="text-right">
                          <div className="text-white font-bold text-xs">{p.name}</div>
                          <div className="text-sky-400 text-[10px] font-black">{p.price} $</div>
                       </div>
                    </div>
                    <button onClick={() => deleteStoreProduct(p.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
               <h4 className="text-white font-black text-xs uppercase tracking-widest">إدارة طلبات المتجر</h4>
               <button onClick={deletePendingOrders} className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[9px] font-black uppercase hover:bg-red-500/20 transition-all">حذف الطلبات المعلقة</button>
            </div>
            {storeOrders.map(order => (
              <div key={order.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="text-right">
                    <div className="text-white font-bold text-sm">{order.productName}</div>
                    <div className="text-slate-500 text-[10px]">{order.username}</div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] text-sky-400 font-bold">العدد: {order.quantity}</span>
                      <span className="text-[9px] text-slate-500 font-bold">التواصل: {order.contactMethod === 'whatsapp' ? 'واتساب' : 'المنصة'}</span>
                      {order.userWhatsapp && (
                        <span className="text-[9px] text-emerald-500 font-bold">واتساب العميل: {order.userWhatsapp}</span>
                      )}
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${
                    order.status === 'completed' ? 'bg-emerald-500/20 text-emerald-500' :
                    order.status === 'processing' ? 'bg-sky-500/20 text-sky-500' :
                    'bg-amber-500/20 text-amber-500'
                  }`}>
                    {order.status}
                  </div>
                </div>
                {order.giftUrl && (
                  <div className="aspect-square w-20 rounded-lg overflow-hidden border border-white/10">
                    <img src={order.giftUrl} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => updateOrderStatus(order.id, 'processing')} className="flex-1 py-2 bg-sky-500/10 text-sky-500 rounded-lg text-[9px] font-black uppercase border border-sky-500/20">قيد التنفيذ</button>
                  <button onClick={() => updateOrderStatus(order.id, 'completed')} className="flex-1 py-2 bg-emerald-500/10 text-emerald-500 rounded-lg text-[9px] font-black uppercase border border-emerald-500/20">مكتمل</button>
                  <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="flex-1 py-2 bg-red-500/10 text-red-500 rounded-lg text-[9px] font-black uppercase border border-red-500/20">إلغاء</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'backgrounds' && (
          <div className="space-y-6">
            <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 space-y-4">
               <h4 className="text-white font-black text-xs uppercase tracking-widest">إضافة خلفية عرض جديدة</h4>
               <div className="space-y-3">
                  <input 
                    type="text" placeholder="اسم الخلفية (مثلاً: Neon Stage)" 
                    value={newBgLabel} onChange={(e) => setNewBgLabel(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-sky-500"
                  />
                  <div className="flex gap-2">
                    <input 
                      type="text" placeholder="رابط الصورة أو ارفع ملف..." 
                      value={newBgUrl} onChange={(e) => setNewBgUrl(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] text-slate-400 outline-none focus:border-sky-500 font-mono"
                    />
                    <button onClick={() => bgFileRef.current?.click()} className="px-4 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">📁</button>
                    <input type="file" ref={bgFileRef} hidden onChange={handleBgFileUpload} accept="image/*" />
                  </div>
                  <button 
                    onClick={() => addBackground(newBgLabel, newBgUrl)}
                    className="w-full py-3 bg-sky-500 text-white rounded-xl text-[10px] font-black uppercase shadow-glow-sky active:scale-95 transition-all"
                  >حفظ الخلفية في المكتبة</button>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               {backgrounds.map(bg => (
                 <div key={bg.id} className="group bg-white/5 border border-white/10 rounded-2xl p-2 relative overflow-hidden">
                    <div className="aspect-[9/16] rounded-xl overflow-hidden bg-black/40 mb-2">
                       {bg.url && <img src={bg.url} className="w-full h-full object-cover" alt={bg.label} />}
                    </div>
                    <div className="text-[9px] font-black text-white px-1 truncate">{bg.label}</div>
                    <button 
                      onClick={() => deleteBackground(bg.id)}
                      className="absolute top-2 left-2 w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="space-y-6">
            <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 space-y-4">
              <h4 className="text-white font-black text-xs uppercase tracking-widest">توليد أكواد تفعيل جديدة</h4>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => generateKeys('monthly', 1)} className="py-3 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl text-[9px] font-black uppercase">شهر</button>
                <button onClick={() => generateKeys('quarterly', 1)} className="py-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[9px] font-black uppercase">3 أشهر</button>
                <button onClick={() => generateKeys('yearly', 1)} className="py-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-[9px] font-black uppercase">سنة</button>
              </div>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pl-2">
              {keys.map(k => (
                  <div key={k.id} className={`p-4 rounded-2xl border flex items-center justify-between ${k.isUsed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/10'}`}>
                    <div className="text-right flex-1">
                      <div className="text-white font-mono font-bold text-sm tracking-widest select-all">{k.key}</div>
                      <div className="text-[8px] font-black uppercase text-slate-500 mt-1">
                        {k.duration === 'monthly' ? 'شهر' : k.duration === 'quarterly' ? '3 أشهر' : 'سنة'} • {k.isUsed ? `مستخدم: ${k.usedBy}` : 'جاهز'}
                      </div>
                    </div>
                    <button onClick={async () => await deleteDoc(doc(db, "license_keys", k.id))} className="p-2 text-slate-600 hover:text-red-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'branding' && <BrandingSettings settings={settings} />}
        {activeTab === 'logs' && (
          <div className="bg-slate-950/40 rounded-[2rem] border border-white/5 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-white/[0.03] text-slate-500 text-[8px] font-black uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">المصمم</th>
                  <th className="px-6 py-4">الملف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.slice(0, 20).map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 text-[10px] text-slate-500">{log.userName}</td>
                    <td className="px-6 py-4 text-xs font-bold text-white truncate max-w-[150px]">{log.fileName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-8 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 shadow-glow-red animate-pulse">
               <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </div>
            <div className="text-center space-y-2">
               <h3 className="text-2xl font-black text-white uppercase tracking-tighter">منطقة الخطر</h3>
               <p className="text-slate-500 text-xs font-bold max-w-md mx-auto">هنا يمكنك حذف جميع بيانات الموقع (المستخدمين، الطلبات، المنتجات، السجلات). هذه العملية نهائية ولا يمكن التراجع عنها.</p>
            </div>
            <button 
              onClick={handleFactoryReset}
              disabled={isResetting}
              className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-glow-red transition-all active:scale-95 flex items-center gap-3"
            >
              {isResetting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  جاري الحذف...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  حذف جميع البيانات (Format)
                </>
              )}
            </button>
            <style>{`
              .shadow-glow-red { box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); }
            `}</style>
          </div>
        )}
      </div>

      <style>{`
        .shadow-glow-sky { box-shadow: 0 0 20px rgba(14, 165, 233, 0.4); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
};
