import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, where } from 'firebase/firestore';
import { StoreProduct, UserRecord, AppState, StoreOrder } from '../types';

interface StoreProps {
  currentUser: UserRecord | null;
  onLoginRequired: () => void;
}

export const Store: React.FC<StoreProps> = ({ currentUser, onLoginRequired }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'products' | 'orders'>('products');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [contactMethod, setContactMethod] = useState<'whatsapp' | 'platform'>('platform');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderStep, setOrderStep] = useState<'preview' | 'upload' | 'success'>('preview');
  const [giftFile, setGiftFile] = useState<File | null>(null);
  const [giftPreview, setGiftPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fullScreenVideo, setFullScreenVideo] = useState<string | null>(null);
  const [userWhatsapp, setUserWhatsapp] = useState('');
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAdminWhatsapp(data.whatsappNumber || '');
      }
    });
    return () => unsub();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['الكل', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'الكل') return products;
    return products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  useEffect(() => {
    const q = query(collection(db, "store_products"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StoreProduct[]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    // Remove orderBy to avoid composite index requirement
    const q = query(collection(db, "store_orders"), where("userId", "==", currentUser.id));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StoreOrder[];
      // Sort client-side by createdAt
      fetchedOrders.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setOrders(fetchedOrders);
    });
    return () => unsub();
  }, [currentUser]);

  const handleOrderClick = (product: StoreProduct) => {
    if (!currentUser) {
      onLoginRequired();
      return;
    }
    setSelectedProduct(product);
    setSelectedFormat(product.supportedFormats[0] || 'MP4');
    setQuantity(1);
    setIsOrdering(true);
    setOrderStep('preview');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGiftFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setGiftPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const submitOrder = async () => {
    if (!currentUser || !selectedProduct) return;
    
    // Check coins
    if (!currentUser.isVIP && currentUser.coins < selectedProduct.price) {
      alert(`رصيدك غير كافٍ. تحتاج إلى $${selectedProduct.price}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Deduct coins if not VIP
      if (!currentUser.isVIP) {
        await updateDoc(doc(db, "users", currentUser.id), {
          coins: increment(-selectedProduct.price)
        });
      }

      // Create order
      const orderData = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        userId: currentUser.id,
        username: currentUser.name,
        userWhatsapp,
        status: 'pending',
        price: selectedProduct.price,
        quantity,
        contactMethod,
        selectedFormat,
        giftUrl: giftPreview || null,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "store_orders"), orderData);

      setOrderStep('success');
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء إرسال الطلب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openWhatsapp = () => {
    if (!selectedProduct || !currentUser || !adminWhatsapp) return;
    const message = `طلب جديد من المتجر:
المنتج: ${selectedProduct.name}
الكمية: ${quantity}
الصيغة: ${selectedFormat}
رصيد المستخدم: ${currentUser.coins}
اسم المستخدم: ${currentUser.name}`;
    window.open(`https://wa.me/${adminWhatsapp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="animate-in fade-in duration-1000 font-arabic pb-20 text-right" dir="rtl">
      <div className="mb-12 text-center">
        <h2 className="text-4xl font-black text-white mb-4 uppercase tracking-tighter">Quantum Designer Store</h2>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Exclusive Assets & Custom Animations</p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-12">
         <div className="bg-slate-950/60 p-1 rounded-2xl border border-white/5 flex">
            <button 
              onClick={() => setActiveTab('products')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'products' ? 'bg-sky-500 text-white shadow-glow-sky' : 'text-slate-500 hover:text-white'}`}
            >
              المنتجات المتاحة
            </button>
            <button 
              onClick={() => {
                if (!currentUser) onLoginRequired();
                else setActiveTab('orders');
              }}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-sky-500 text-white shadow-glow-sky' : 'text-slate-500 hover:text-white'}`}
            >
              طلباتي السابقة
            </button>
         </div>

         {activeTab === 'products' && (
           <div className="flex flex-wrap justify-center gap-2">
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedCategory === cat ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-slate-500 border-white/5 hover:border-white/10'}`}
                >
                  {cat}
                </button>
              ))}
           </div>
         )}
      </div>

      {activeTab === 'products' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProducts.map(product => (
            <div key={product.id} className="group bg-slate-900/40 border border-white/5 rounded-[3rem] overflow-hidden hover:border-sky-500/30 transition-all shadow-2xl flex flex-col items-center">
              <div className="w-full aspect-video relative overflow-hidden bg-black group-hover:cursor-pointer" onClick={() => setFullScreenVideo(product.videoUrl)}>
                {/* Blurred background using image */}
                {product.imageUrl && (
                  <>
                    <img 
                      src={product.imageUrl} 
                      className="absolute inset-0 w-full h-full object-cover blur-xl opacity-30 scale-110" 
                      referrerPolicy="no-referrer"
                    />
                    <img 
                      src={product.imageUrl} 
                      className="relative w-full h-full object-contain z-10 opacity-80 group-hover:opacity-100 transition-opacity duration-700" 
                      referrerPolicy="no-referrer"
                    />
                  </>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-20"></div>
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-[8px] text-white/60 font-black uppercase z-30">اضغط للمعاينة</div>
                <div className="absolute bottom-4 right-4 bg-sky-500 text-white px-4 py-1.5 rounded-xl text-[10px] font-black shadow-glow-sky z-30">
                  ${product.price}
                </div>
              </div>
              <div className="p-8 w-full flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                   <h3 className="text-xl font-black text-white">{product.name}</h3>
                   <span className="text-[8px] font-black text-sky-400 bg-sky-500/10 px-2 py-1 rounded-lg border border-sky-500/20 uppercase">{product.category}</span>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{product.description}</p>
                <div className="flex flex-wrap gap-2 mt-auto">
                  {product.supportedFormats.map((f, idx) => (
                    <span key={`${product.id}-${f}-${idx}`} className="text-[8px] font-black text-slate-400 border border-white/10 px-2 py-1 rounded-lg uppercase">{f}</span>
                  ))}
                </div>
                <button 
                  onClick={() => handleOrderClick(product)}
                  className="w-full py-4 bg-white/5 hover:bg-sky-500 text-white rounded-2xl border border-white/10 hover:border-sky-400 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
                >
                  طلب المنتج الآن
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-6">
           {orders.length === 0 ? (
             <div className="py-20 text-center bg-slate-950/40 rounded-[3rem] border border-white/5">
                <p className="text-slate-500 font-black uppercase tracking-widest text-xs">لا توجد طلبات سابقة حتى الآن</p>
             </div>
           ) : (
             orders.map(order => (
               <div key={order.id} className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-6 flex items-center justify-between gap-6 hover:bg-slate-900/60 transition-all">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-sky-500/10 rounded-2xl flex items-center justify-center text-sky-400 border border-sky-500/20">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                     </div>
                     <div className="text-right">
                        <h4 className="text-white font-black text-sm">{order.productName}</h4>
                        <div className="flex items-center gap-3 mt-1">
                           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">العدد: {order.quantity}</span>
                           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">الصيغة: { order.selectedFormat || 'MP4' }</span>
                           <span className="text-[8px] font-black text-sky-500 uppercase tracking-widest">${order.price * order.quantity}</span>
                        </div>
                     </div>
                  </div>
                  <div className="text-left">
                     <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                       order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                       order.status === 'processing' ? 'bg-sky-500/10 text-sky-500 border-sky-500/20' :
                       order.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                       'bg-amber-500/10 text-amber-500 border-amber-500/20'
                     }`}>
                        {order.status === 'completed' ? 'مكتمل' : 
                         order.status === 'processing' ? 'جاري التنفيذ' :
                         order.status === 'cancelled' ? 'ملغي' : 'قيد الانتظار'}
                     </div>
                     <div className="text-[7px] text-slate-600 font-bold uppercase mt-2">
                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('ar-EG') : '---'}
                     </div>
                  </div>
               </div>
             ))
           )}
        </div>
      )}

      {fullScreenVideo && (
        <div className="fixed inset-0 z-[600] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setFullScreenVideo(null)}>
           <button className="absolute top-8 right-8 p-4 text-white hover:bg-white/10 rounded-full transition-all z-10">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
           <div className="w-full max-w-6xl aspect-video rounded-[3rem] overflow-hidden border border-white/10 shadow-3xl relative" onClick={e => e.stopPropagation()}>
              <video 
                src={fullScreenVideo} 
                className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-50 scale-110" 
                muted loop autoPlay playsInline
              />
              <video src={fullScreenVideo} autoPlay loop controls className="relative w-full h-full object-contain z-10" />
           </div>
        </div>
      )}

      {isOrdering && selectedProduct && (
        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-[4rem] w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-3xl animate-in zoom-in duration-500">
            <div className="p-8 sm:p-12">
              <div className="flex justify-between items-center mb-10">
                <button onClick={() => setIsOrdering(false)} className="p-3 hover:bg-red-500/20 text-white rounded-2xl transition-all border border-white/10">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">تفاصيل الطلب الكمي</h3>
              </div>

              {orderStep === 'preview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div className="w-full aspect-video rounded-[2.5rem] overflow-hidden border border-white/10 bg-black relative shadow-2xl group/vid cursor-pointer" onClick={() => setFullScreenVideo(selectedProduct.videoUrl)}>
                      <video 
                        src={selectedProduct.videoUrl} 
                        className="w-full h-full object-cover" 
                        muted loop autoPlay playsInline 
                        poster={selectedProduct.imageUrl}
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover/vid:bg-black/0 transition-colors z-15"></div>
                      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-[10px] text-sky-400 font-black z-20">اضغط للمعاينة</div>
                    </div>
                    <div className="bg-white/[0.03] p-8 rounded-[2.5rem] border border-white/5 space-y-4">
                       <h4 className="text-white font-black text-lg">{selectedProduct.name}</h4>
                       <p className="text-slate-400 text-sm leading-relaxed">{selectedProduct.description}</p>
                       
                       <div className="pt-4 border-t border-white/5 space-y-3">
                          <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">اختر صيغة التسليم</label>
                          <div className="flex flex-wrap gap-2">
                             {selectedProduct.supportedFormats.map((f, idx) => (
                               <button 
                                 key={`order-${f}-${idx}`}
                                 onClick={() => setSelectedFormat(f)}
                                 className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${selectedFormat === f ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 text-slate-500 border-white/10'}`}
                               >
                                 {f}
                               </button>
                             ))}
                          </div>
                       </div>

                       <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                          <span className="text-slate-500 text-[10px] font-black uppercase">التكلفة الإجمالية</span>
                          <span className="text-sky-400 font-black text-xl">${selectedProduct.price * quantity}</span>
                       </div>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-8">
                    <div className="bg-white/[0.03] p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                       <div className="space-y-3">
                          <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">الكمية المطلوبة</label>
                          <div className="flex items-center gap-4 bg-black/40 p-2 rounded-2xl border border-white/10">
                             <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl text-white hover:bg-white/10 transition-all">-</button>
                             <input 
                                type="number" 
                                value={quantity} 
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                className="flex-1 bg-transparent text-center text-white font-black text-lg outline-none"
                             />
                             <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl text-white hover:bg-white/10 transition-all">+</button>
                          </div>
                       </div>

                       <div className="space-y-3">
                          <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">طريقة التواصل المفضلة</label>
                          <div className="grid grid-cols-2 gap-3">
                             <button 
                                onClick={() => setContactMethod('platform')}
                                className={`py-3 rounded-xl text-[10px] font-black border transition-all flex flex-col items-center gap-2 ${contactMethod === 'platform' ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 text-slate-500 border-white/10'}`}
                             >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                المنصة
                             </button>
                             <button 
                                onClick={() => setContactMethod('whatsapp')}
                                className={`py-3 rounded-xl text-[10px] font-black border transition-all flex flex-col items-center gap-2 ${contactMethod === 'whatsapp' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/5 text-slate-500 border-white/10'}`}
                             >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                واتساب
                             </button>
                          </div>
                       </div>

                       <div className="space-y-3">
                          <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">رقم الواتساب الخاص بك (للتواصل معك)</label>
                          <input 
                             type="text" 
                             value={userWhatsapp}
                             onChange={(e) => setUserWhatsapp(e.target.value)}
                             placeholder="966XXXXXXXXX"
                             className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-xs outline-none"
                          />
                       </div>
                    </div>
                    <button 
                      onClick={submitOrder}
                      disabled={isSubmitting}
                      className="w-full py-6 bg-sky-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-glow-sky active:scale-95 transition-all"
                    >
                      {isSubmitting ? 'جاري إرسال الطلب...' : (contactMethod === 'platform' ? 'تأكيد الطلب وخصم الكوينز' : 'تأكيد الطلب والتواصل واتساب')}
                    </button>
                  </div>
                </div>
              )}

              {orderStep === 'success' && (
                <div className="py-20 text-center space-y-8 animate-in zoom-in duration-700">
                   <div className="w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-glow-emerald">
                      <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                   </div>
                   <div className="space-y-4">
                      <h3 className="text-3xl font-black text-white">تم استلام طلبك بنجاح!</h3>
                      <p className="text-slate-500 text-sm max-w-md mx-auto">سيقوم فريق التصميم بمعالجة طلبك ودمج الهدية مع القالب المختار. ستصلك النتيجة قريباً.</p>
                   </div>
                   <div className="flex flex-col gap-3 items-center">
                     {contactMethod === 'whatsapp' && adminWhatsapp && (
                       <button onClick={openWhatsapp} className="px-12 py-5 bg-emerald-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-glow-emerald animate-pulse">
                         فتح المحادثة في واتساب
                       </button>
                     )}
                     <button onClick={() => setIsOrdering(false)} className="px-12 py-5 bg-sky-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-glow-sky">العودة للمتجر</button>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .shadow-glow-sky { box-shadow: 0 0 30px rgba(14, 165, 233, 0.4); }
        .shadow-glow-emerald { box-shadow: 0 0 40px rgba(16, 185, 129, 0.5); }
        .shadow-3xl { box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.9); }
      `}</style>
    </div>
  );
};
