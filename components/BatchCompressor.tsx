
import React, { useState, useRef, useCallback, useEffect } from 'react';

declare var JSZip: any;

interface ImageFile {
  file: File;
  id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  originalSize: number;
  compressedSize?: number;
  previewUrl: string;
  savingPercent?: number;
}

export const BatchCompressor: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [quality, setQuality] = useState(85);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const newImages: ImageFile[] = files.map(file => ({
      file,
      id: Math.random().toString(36).substring(2, 11) + Date.now(),
      status: 'pending',
      progress: 0,
      originalSize: file.size,
      previewUrl: URL.createObjectURL(file)
    }));
    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // محرك ضغط PNG الاحترافي عبر تكميم الألوان
  const compressPNGPro = async (imgFile: ImageFile, q: number): Promise<{ blob: Blob; size: number; percent: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          canvas.width = w;
          canvas.height = h;
          
          const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
          if (!ctx) throw new Error('Context fail');
          
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          
          // إذا كانت الجودة أقل من 100، نقوم بتطبيق تقنية Quantization لتقليل حجم PNG
          if (q < 100) {
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            
            // حساب مستويات التكميم بناءً على الجودة (0-100)
            // الجودة 100 تعني 256 مستوى (لا تغيير)، الجودة 0 تعني 4 مستويات (ضغط أقصى)
            const levels = Math.max(4, Math.floor((q / 100) * 255));
            const factor = 255 / (levels - 1);

            for (let i = 0; i < data.length; i += 4) {
              // معالجة قنوات R, G, B فقط والحفاظ على Alpha (الشفافية)
              data[i] = Math.round(Math.round(data[i] / factor) * factor);     // Red
              data[i+1] = Math.round(Math.round(data[i+1] / factor) * factor); // Green
              data[i+2] = Math.round(Math.round(data[i+2] / factor) * factor); // Blue
              // قناة الشفافية data[i+3] تظل كما هي لضمان الجودة
            }
            ctx.putImageData(imageData, 0, 0);
          }
          
          canvas.toBlob((blob) => {
            if (blob) {
              let finalBlob = blob;
              let finalSize = blob.size;
              
              // المقارنة الذكية: إذا كان الملف الناتج أكبر، نستخدم الأصلي (يحدث في الصور البسيطة جداً)
              if (finalSize >= imgFile.originalSize && imgFile.file.type === 'image/png') {
                finalBlob = imgFile.file;
                finalSize = imgFile.originalSize;
              }

              const saving = imgFile.originalSize > finalSize 
                ? Math.round(((imgFile.originalSize - finalSize) / imgFile.originalSize) * 100) 
                : 0;

              resolve({ blob: finalBlob, size: finalSize, percent: saving });
            } else reject('Blob Error');
          }, 'image/png');
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject('Load Error');
      img.src = imgFile.previewUrl;
    });
  };

  const startBatchProcess = async () => {
    if (images.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setOverallProgress(0);

    const zip = new JSZip();
    const total = images.length;
    let processedCount = 0;
    const CONCURRENCY = 3;

    const processQueue = [...images];
    const workers = Array(CONCURRENCY).fill(null).map(async () => {
      while (processQueue.length > 0) {
        const item = processQueue.shift();
        if (!item) break;

        setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'processing' } : img));

        try {
          const result = await compressPNGPro(item, quality);
          zip.file(item.file.name.replace(/\.[^/.]+$/, "") + "_optimized.png", result.blob);
          
          setImages(prev => prev.map(img => 
            img.id === item.id ? { ...img, status: 'done', compressedSize: result.size, savingPercent: result.percent, progress: 100 } : img
          ));
        } catch (e) {
          setImages(prev => prev.map(img => img.id === item.id ? { ...img, status: 'error' } : img));
        }

        processedCount++;
        setOverallProgress(Math.floor((processedCount / total) * 100));
      }
    });

    await Promise.all(workers);
    
    if (processedCount > 0) {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      link.download = `PNG_Quantized_Q${quality}_${Date.now()}.zip`;
      link.click();
    }
    setIsProcessing(false);
  };

  const totalOriginalSize = images.reduce((acc, img) => acc + img.originalSize, 0);
  const totalCompressedSize = images.reduce((acc, img) => acc + (img.compressedSize || img.originalSize), 0);

  return (
    <div className="flex flex-col gap-8 pb-32 animate-in fade-in slide-in-from-bottom-8 duration-1000 font-arabic select-none">
      <div className="flex flex-col lg:flex-row items-center justify-between p-8 rounded-[3.5rem] border border-white/5 gap-6 shadow-2xl bg-slate-900/60 backdrop-blur-3xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"></div>
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-sky-600 rounded-2xl flex items-center justify-center text-white shadow-glow-emerald text-3xl">
             <span className={isProcessing ? "animate-spin" : "animate-pulse"}>💎</span>
          </div>
          <div className="text-right lg:text-left">
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">محرك PNG الكمي الذكي</h2>
            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">Smart Quantization Engine • Professional Grade</p>
          </div>
        </div>
        
        <button onClick={onCancel} className="px-8 py-4 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-2xl border border-white/10 transition-all font-black text-[10px] tracking-widest uppercase active:scale-95">
          إلغاء العملية
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="bg-slate-950/80 rounded-[3.5rem] p-8 border border-white/5 min-h-[600px] flex flex-col shadow-3xl relative">
             {images.length === 0 ? (
               <div onClick={() => fileInputRef.current?.click()} className="flex-1 border-2 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center gap-6 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all cursor-pointer group">
                 <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 </div>
                 <div className="text-center">
                    <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">إدراج صور PNG للتحسين</h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">سيتم تطبيق معالجة Bit-depth للحفاظ على التفاصيل</p>
                 </div>
                 <input type="file" multiple ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
               </div>
             ) : (
               <div className="flex-1 flex flex-col gap-6">
                 <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-5 py-2.5 bg-white/5 rounded-xl border border-white/5">المجموعة الحالية ({images.length})</span>
                    <button onClick={() => { images.forEach(i => URL.revokeObjectURL(i.previewUrl)); setImages([]); }} className="text-red-500 text-[9px] font-black uppercase hover:text-red-400 border border-red-500/20 px-4 py-2 rounded-xl">تصفية القائمة</button>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar p-2">
                   {images.map(img => (
                     <div key={img.id} className={`bg-slate-900/40 rounded-[2rem] p-3 border transition-all ${img.status === 'error' ? 'border-red-500/30' : 'border-white/5'}`}>
                        <div className="aspect-square rounded-2xl overflow-hidden bg-black/40 mb-3 relative group transparency-bg-card">
                           <img src={img.previewUrl} className="w-full h-full object-contain p-2" loading="lazy" />
                           {img.status === 'processing' && (
                             <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                             </div>
                           )}
                           {img.status === 'done' && (
                             <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-[1px]">
                                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-glow-emerald">
                                   <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                </div>
                             </div>
                           )}
                        </div>
                        <div className="text-[8px] font-black text-slate-500 uppercase truncate px-1 text-center mb-1">{img.file.name}</div>
                        {img.status === 'done' && (
                           <div className="flex justify-between items-center px-1">
                              <span className="text-[10px] text-emerald-400 font-black">-{img.savingPercent}%</span>
                              <span className="text-[7px] text-slate-700 font-bold uppercase">PNG OK</span>
                           </div>
                        )}
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/60 rounded-[3.5rem] p-8 border border-white/5 shadow-2xl backdrop-blur-3xl flex flex-col gap-10 sticky top-24">
             <div className="flex flex-col gap-2">
                <h3 className="text-white font-black text-sm uppercase tracking-widest">مستوى جودة الـ PNG</h3>
                <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest italic tracking-tighter">Bit-Depth Quantization Level</p>
             </div>

             <div className="bg-black/40 rounded-[2.5rem] p-8 border border-white/5 space-y-8">
                <div className="flex justify-between items-end">
                   <div className="flex flex-col">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">دقة الألوان</span>
                      <span className={`text-[10px] font-bold uppercase ${quality > 80 ? 'text-emerald-400' : quality > 40 ? 'text-sky-400' : 'text-amber-500'}`}>
                        {quality === 100 ? 'Lossless (Perfect)' : quality > 80 ? 'احترافية (High)' : quality > 40 ? 'متوازنة (Safe)' : 'ضغط فائق (Extra)'}
                      </span>
                   </div>
                   <div className="text-white font-black text-5xl flex items-end leading-none">
                      {quality}<span className="text-lg mb-1 text-emerald-500 ml-1">%</span>
                   </div>
                </div>
                
                <div className="relative group px-1">
                  <input type="range" min="1" max="100" value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} className="w-full h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500 transition-all" />
                  <div className="flex justify-between mt-4 px-1">
                    <span className="text-[9px] text-slate-700 font-black uppercase tracking-tighter">أقصى ضغط</span>
                    <span className="text-[9px] text-slate-700 font-black uppercase tracking-tighter">أعلى دقة</span>
                  </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 rounded-3xl p-5 border border-white/5 flex flex-col gap-1 shadow-inner">
                   <span className="text-slate-600 text-[9px] font-black uppercase">الحجم الأصلي</span>
                   <span className="text-white font-mono text-sm font-bold">{(totalOriginalSize / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="bg-emerald-500/5 rounded-3xl p-5 border border-emerald-500/10 flex flex-col gap-1 shadow-inner">
                   <span className="text-emerald-600 text-[9px] font-black uppercase">الحجم المتوقع</span>
                   <span className="text-emerald-400 font-mono text-sm font-black">
                     {totalCompressedSize > 0 ? (totalCompressedSize / 1024 / 1024).toFixed(2) : '---'} MB
                   </span>
                </div>
             </div>

             <button onClick={startBatchProcess} disabled={images.length === 0 || isProcessing} className={`w-full py-8 rounded-[2.5rem] text-[12px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-4 group ${isProcessing ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-600 to-sky-600 text-white shadow-glow-emerald hover:scale-[1.02] active:scale-95'}`}>
               {isProcessing ? (
                 <><span>المعالجة مستمرة...</span><div className="w-5 h-5 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></>
               ) : (
                 <><span>تطبيق الضغط الذكي</span><svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></>
               )}
             </button>
             
             {isProcessing && (
               <div className="space-y-4">
                 <div className="flex justify-between text-[11px] font-black uppercase text-emerald-500">
                    <span className="animate-pulse">تحسين مسارات البيكسل...</span>
                    <span>{overallProgress}%</span>
                 </div>
                 <div className="w-full h-3.5 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <div className="h-full bg-gradient-to-r from-emerald-600 via-sky-500 to-emerald-400 shadow-glow-emerald transition-all duration-700 rounded-full" style={{ width: `${overallProgress}%` }}></div>
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>
      
      <style>{`
        .shadow-glow-emerald { box-shadow: 0 0 30px rgba(16, 185, 129, 0.4); }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.2); border-radius: 10px; }
        .transparency-bg-card { background-image: linear-gradient(45deg, #020617 25%, transparent 25%), linear-gradient(-45deg, #020617 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #020617 75%), linear-gradient(-45deg, transparent 75%, #020617 75%); background-size: 10px 10px; }
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 28px;
            width: 28px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.6);
            cursor: pointer;
            border: 5px solid #0f172a;
        }
      `}</style>
    </div>
  );
};
