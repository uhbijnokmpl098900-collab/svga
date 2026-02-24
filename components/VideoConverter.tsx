
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileMetadata, UserRecord } from '../types';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { 
  Video, 
  Box, 
  Image as ImageIcon, 
  Film, 
  Download, 
  Settings2, 
  Zap, 
  ChevronLeft,
  Maximize,
  Moon,
  Layers,
  Music,
  Trash2
} from 'lucide-react';

declare var SVGA: any;
declare var protobuf: any;
declare var pako: any;
declare var GIF: any;
declare var UPNG: any;
declare var WebMMuxer: any;

interface VideoConverterProps {
  currentUser: UserRecord | null;
  onCancel: () => void;
}

export const VideoConverter: React.FC<VideoConverterProps> = ({ currentUser, onCancel }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('VAP (MP4)');
  const [exportScale, setExportScale] = useState(1.0);
  const [customWidth, setCustomWidth] = useState<number | ''>('');
  const [customHeight, setCustomHeight] = useState<number | ''>('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [removeBlack, setRemoveBlack] = useState(false);
  const [fadeConfig, setFadeConfig] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const formats = [
    { id: 'VAP (MP4)', name: 'VAP (Alpha+RGB)', icon: '📹', cost: 1, desc: 'فيديو مع قناة شفافية منفصلة' },
    { id: 'SVGA 2.0', name: 'SVGA Animation', icon: '📦', cost: 1, desc: 'ملف SVGA متوافق مع تطبيقات البث' },
    { id: 'GIF (Animation)', name: 'GIF الشفاف', icon: '🖼️', cost: 1, desc: 'صور متحركة للمواقع والدردشة' },
    { id: 'APNG (Animation)', name: 'APNG الشفاف', icon: '🎞️', cost: 1, desc: 'جودة أعلى من GIF مع شفافية كاملة' },
  ];

  const checkAndDeductCoins = async (cost: number): Promise<boolean> => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    try {
      const userRef = doc(db, "users", currentUser.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.isVIP) return true;
        if ((userData.freeAttempts || 0) > 0) {
          await updateDoc(userRef, { freeAttempts: increment(-1) });
          return true;
        }
        if ((userData.coins || 0) < cost) {
          alert(`رصيدك غير كافٍ. يرجى شحن الرصيد.`);
          return false;
        }
        await updateDoc(userRef, { coins: increment(-cost) });
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  const applyTransparencyEffects = (ctx: CanvasRenderingContext2D, width: number, height: number, configOverride?: typeof fadeConfig) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const currentFade = configOverride || fadeConfig;

    const fadeTopLimit = (height * currentFade.top) / 100;
    const fadeBottomLimit = height - (height * currentFade.bottom) / 100;
    const fadeLeftLimit = (width * currentFade.left) / 100;
    const fadeRightLimit = width - (width * currentFade.right) / 100;

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);

      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      let a = data[i + 3];

      // 1. Edge Fade Calculation
      let edgeAlpha = 1.0;
      if (currentFade.top > 0 && y < fadeTopLimit) edgeAlpha *= (y / fadeTopLimit);
      if (currentFade.bottom > 0 && y > fadeBottomLimit) edgeAlpha *= ((height - y) / (height - fadeBottomLimit));
      if (currentFade.left > 0 && x < fadeLeftLimit) edgeAlpha *= (x / fadeLeftLimit);
      if (currentFade.right > 0 && x > fadeRightLimit) edgeAlpha *= ((width - x) / (width - fadeRightLimit));

      // 2. Remove Black Logic (Enhanced)
      if (removeBlack) {
        const brightness = (r + g + b) / 3;
        if (brightness < 80) {
          const factor = brightness / 80;
          a = Math.min(a, 255 * factor);
          
          // Brighten to avoid dark fringes
          const boost = 1.0 - factor;
          r = Math.min(255, r + (255 - r) * boost * 0.8);
          g = Math.min(255, g + (255 - g) * boost * 0.8);
          b = Math.min(255, b + (255 - b) * boost * 0.8);
        }
      }

      const finalAlpha = (a / 255) * edgeAlpha;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(finalAlpha * 255);
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const handleConvert = async () => {
    if (!file) return;
    const format = formats.find(f => f.id === selectedFormat);
    if (!format) return;

    const canProceed = await checkAndDeductCoins(format.cost);
    if (!canProceed) return;

    setIsProcessing(true);
    setPhase('جاري تحليل الفيديو...');
    setProgress(0);

    try {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;
      await video.play();
      video.pause();

      const vw = customWidth ? Number(customWidth) : Math.round(video.videoWidth * exportScale);
      const vh = customHeight ? Number(customHeight) : Math.round(video.videoHeight * exportScale);
      const duration = video.duration;
      const fps = 30;
      const totalFrames = Math.floor(duration * fps);

      // Handle Audio if provided
      let audioData: Uint8Array | null = null;
      if (audioFile) {
        const arrayBuffer = await audioFile.arrayBuffer();
        audioData = new Uint8Array(arrayBuffer);
      }

      if (selectedFormat === 'VAP (MP4)') {
        await exportToVAP(video, vw, vh, totalFrames, fps, audioData);
      } else if (selectedFormat === 'SVGA 2.0') {
        await exportToSVGA(video, vw, vh, totalFrames, fps, audioData);
      } else if (selectedFormat === 'GIF (Animation)') {
        await exportToGIF(video, vw, vh, totalFrames, fps);
      } else if (selectedFormat === 'APNG (Animation)') {
        await exportToAPNG(video, vw, vh, totalFrames, fps);
      }

      alert("تم التحويل بنجاح!");
      onCancel();
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء التحويل: " + (e as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToVAP = async (video: HTMLVideoElement, vw: number, vh: number, totalFrames: number, fps: number, audioData: Uint8Array | null) => {
    setPhase('جاري إنشاء فيديو VAP...');
    const vapCanvas = document.createElement('canvas');
    vapCanvas.width = vw * 2;
    vapCanvas.height = vh;
    const vCtx = vapCanvas.getContext('2d', { willReadFrequently: true });
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = vw;
    tempCanvas.height = vh;
    const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    // Audio Setup
    let audioTrack: any = undefined;
    let audioEncoder: AudioEncoder | null = null;
    let audioDataChunks: AudioData[] = [];

    if (audioData) {
        try {
            // Use OfflineAudioContext for more stable decoding
            const offlineCtx = new OfflineAudioContext(2, 48000 * 1, 48000);
            const audioBuffer = await offlineCtx.decodeAudioData(audioData.buffer.slice(0)); // Clone buffer to be safe
            
            audioTrack = {
                codec: 'A_OPUS',
                numberOfChannels: 2,
                sampleRate: 48000
            };

            const numberOfChannels = 2;
            const length = audioBuffer.length;
            const sampleRate = audioBuffer.sampleRate;
            const planarBuffer = new Float32Array(length * numberOfChannels);
            
            for (let c = 0; c < numberOfChannels; c++) {
                const channelData = audioBuffer.numberOfChannels > c 
                    ? audioBuffer.getChannelData(c) 
                    : audioBuffer.getChannelData(0);
                planarBuffer.set(channelData, c * length);
            }

            const chunkSize = sampleRate;
            for (let i = 0; i < length; i += chunkSize) {
                const currentChunkSize = Math.min(chunkSize, length - i);
                const chunkBuffer = new Float32Array(currentChunkSize * numberOfChannels);
                for (let c = 0; c < numberOfChannels; c++) {
                    const start = c * length + i;
                    const end = start + currentChunkSize;
                    chunkBuffer.set(planarBuffer.subarray(start, end), c * currentChunkSize);
                }
                audioDataChunks.push(new AudioData({
                    format: 'f32-planar',
                    sampleRate: sampleRate,
                    numberOfFrames: currentChunkSize,
                    numberOfChannels: numberOfChannels,
                    timestamp: (i / sampleRate) * 1000000,
                    data: chunkBuffer
                }));
            }
        } catch (e) {
            console.warn("Audio encoding failed, continuing without audio", e);
            audioTrack = undefined;
            audioDataChunks = [];
        }
    }

    const muxer = new WebMMuxer.Muxer({
      target: new WebMMuxer.ArrayBufferTarget(),
      video: { codec: 'V_VP9', width: vapCanvas.width, height: vapCanvas.height, frameRate: fps, alpha: false },
      audio: audioTrack
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error(e)
    });

    videoEncoder.configure({ 
        codec: 'vp09.00.10.08', 
        width: vapCanvas.width, 
        height: vapCanvas.height, 
        bitrate: 8000000,
        alpha: 'discard'
    });

    if (audioTrack && audioDataChunks.length > 0) {
        audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => console.error("AudioEncoder error:", e)
        });

        audioEncoder.configure({
            codec: 'opus',
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 128000
        });

        for (const chunk of audioDataChunks) {
            audioEncoder.encode(chunk);
            chunk.close();
        }
        await audioEncoder.flush();
    }

    for (let i = 0; i < totalFrames; i++) {
      video.currentTime = i / fps;
      await new Promise(r => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); r(null); };
        video.addEventListener('seeked', onSeek);
      });

      if (vCtx && tCtx) {
        // Clear temp canvas
        tCtx.clearRect(0, 0, vw, vh);
        tCtx.drawImage(video, 0, 0, vw, vh);
        
        // Apply transparency effects to the source before splitting
        applyTransparencyEffects(tCtx, vw, vh);

        // Prepare VAP Frame
        // IMPORTANT: Fill with black first to ensure no transparency issues
        vCtx.fillStyle = '#000000';
        vCtx.fillRect(0, 0, vapCanvas.width, vapCanvas.height);

        // Draw RGB side (Right)
        vCtx.drawImage(tempCanvas, vw, 0, vw, vh); 

        // Create Alpha Mask
        const imageData = tCtx.getImageData(0, 0, vw, vh);
        const data = imageData.data;
        for (let j = 0; j < data.length; j += 4) {
          const alpha = data[j + 3];
          data[j] = alpha; 
          data[j + 1] = alpha; 
          data[j + 2] = alpha; 
          data[j + 3] = 255;
        }
        tCtx.putImageData(imageData, 0, 0);
        
        // Draw Alpha side (Left)
        vCtx.drawImage(tempCanvas, 0, 0, vw, vh); 
      }

      const bitmap = await createImageBitmap(vapCanvas);
      const frame = new VideoFrame(bitmap, { timestamp: (i * 1000000) / fps });
      videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
      frame.close();
      bitmap.close();
      
      setProgress(Math.floor((i / totalFrames) * 100));
    }

    await videoEncoder.flush();
    muxer.finalize();
    
    downloadBlob(new Blob([muxer.target.buffer], { type: 'video/mp4' }), `${file?.name}_VAP.mp4`);
  };

  const exportToSVGA = async (video: HTMLVideoElement, vw: number, vh: number, totalFrames: number, fps: number, audioData: Uint8Array | null) => {
    setPhase('جاري إنشاء ملف SVGA...');
    const root = protobuf.parse(`syntax="proto3";package com.opensource.svga;message MovieParams{float viewBoxWidth=1;float viewBoxHeight=2;int32 fps=3;int32 frames=4;}message Transform{float a=1;float b=2;float c=3;float d=4;float tx=5;float ty=6;}message Layout{float x=1;float y=2;float width=3;float height=4;}message SpriteEntity{string imageKey=1;repeated FrameEntity frames=2;string matteKey=3;}message FrameEntity{float alpha=1;Layout layout=2;Transform transform=3;string clipPath=4;repeated ShapeEntity shapes=5;string blendMode=6;}message ShapeEntity{int32 type=1;map<string,float> args=2;map<string,string> styles=3;Transform transform=4;}message AudioEntity{string audioKey=1;int32 startFrame=2;int32 endFrame=3;int32 startTime=4;int32 totalTime=5;}message MovieEntity{string version=1;MovieParams params=2;map<string, bytes> images=3;repeated SpriteEntity sprites=4;repeated AudioEntity audios=5;}`).root;
    const MovieEntity = root.lookupType("com.opensource.svga.MovieEntity");
    
    const imagesData: Record<string, Uint8Array> = {};
    const finalSprites: any[] = [];
    const finalAudios: any[] = [];

    if (audioData) {
      const audioKey = "audio_0";
      imagesData[audioKey] = audioData;
      finalAudios.push({
        audioKey: audioKey,
        startFrame: 0,
        endFrame: totalFrames,
        startTime: 0,
        totalTime: Math.round(video.duration * 1000)
      });
    }

    // 1. Prepare for SVGA export
    const isEdgeFadeActive = fadeConfig.top > 0 || fadeConfig.bottom > 0 || fadeConfig.left > 0 || fadeConfig.right > 0;

    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < totalFrames; i++) {
      video.currentTime = i / fps;
      await new Promise(r => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); r(null); };
        video.addEventListener('seeked', onSeek);
      });
      
      if (ctx) {
        ctx.clearRect(0, 0, vw, vh);
        ctx.drawImage(video, 0, 0, vw, vh);
        
        // Apply transparency effects (Edge Fade + Remove Black) directly to the frame
        applyTransparencyEffects(ctx, vw, vh);
        
        const base64 = canvas.toDataURL('image/png'); 
        const binary = atob(base64.split(',')[1]);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        
        const key = `img_${i}`;
        imagesData[key] = bytes;

        const frames = [];
        for (let f = 0; f < totalFrames; f++) {
          frames.push({
            alpha: f === i ? 1.0 : 0.0,
            layout: { x: 0, y: 0, width: vw, height: vh },
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
          });
        }

        finalSprites.push({
          imageKey: key,
          frames: frames
        });
      }
      setProgress(Math.floor((i / totalFrames) * 100));
    }

    const payload = { 
      version: "2.0", 
      params: { viewBoxWidth: vw, viewBoxHeight: vh, fps, frames: totalFrames }, 
      images: imagesData, 
      sprites: finalSprites,
      audios: finalAudios
    };
    
    const buffer = MovieEntity.encode(MovieEntity.create(payload)).finish();
    const compressed = pako.deflate(buffer);
    downloadBlob(new Blob([compressed]), `${file?.name.replace('.mp4', '')}.svga`);
  };

  const exportToGIF = async (video: HTMLVideoElement, vw: number, vh: number, totalFrames: number, fps: number) => {
    setPhase('جاري إنشاء GIF الشفاف...');
    
    // Fetch worker to avoid path issues
    let workerUrl = '/gif.worker.js';
    try {
      const resp = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
      const blob = await resp.blob();
      workerUrl = URL.createObjectURL(blob);
    } catch (e) { console.error("Failed to fetch GIF worker", e); }

    const gif = new GIF({ 
      workers: 2, 
      quality: 10, 
      width: vw, 
      height: vh, 
      transparent: 'rgba(0,0,0,0)',
      workerScript: workerUrl
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = vw; canvas.height = vh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < totalFrames; i++) {
      video.currentTime = i / fps;
      await new Promise(r => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); r(null); };
        video.addEventListener('seeked', onSeek);
      });
      if (ctx) {
        ctx.clearRect(0, 0, vw, vh);
        ctx.drawImage(video, 0, 0, vw, vh);
        applyTransparencyEffects(ctx, vw, vh);
        gif.addFrame(ctx, { copy: true, delay: 1000 / fps });
      }
      setProgress(Math.floor((i / totalFrames) * 50));
    }
    gif.on('finished', (blob: Blob) => {
      downloadBlob(blob, `${file?.name}.gif`);
      setIsProcessing(false);
      if (workerUrl.startsWith('blob:')) URL.revokeObjectURL(workerUrl);
    });
    gif.render();
  };

  const exportToAPNG = async (video: HTMLVideoElement, vw: number, vh: number, totalFrames: number, fps: number) => {
    setPhase('جاري إنشاء APNG الشفاف...');
    const framesData: ArrayBuffer[] = [];
    const delays: number[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = vw; canvas.height = vh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < totalFrames; i++) {
      video.currentTime = i / fps;
      await new Promise(r => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); r(null); };
        video.addEventListener('seeked', onSeek);
      });
      if (ctx) {
        ctx.clearRect(0, 0, vw, vh);
        ctx.drawImage(video, 0, 0, vw, vh);
        applyTransparencyEffects(ctx, vw, vh);
        framesData.push(ctx.getImageData(0, 0, vw, vh).data.buffer);
        delays.push(1000 / fps);
      }
      setProgress(Math.floor((i / totalFrames) * 100));
    }
    const apngBuffer = UPNG.encode(framesData, vw, vh, 0, delays);
    downloadBlob(new Blob([apngBuffer]), `${file?.name}.png`);
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 sm:p-10 bg-slate-900/60 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-3xl text-right font-arabic" dir="rtl">
      <div className="flex items-center justify-between mb-10">
        <button onClick={onCancel} className="p-3 hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-right flex items-center gap-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tighter">محول الفيديو المباشر</h2>
            <p className="text-slate-500 text-xs mt-1 font-bold uppercase tracking-widest">تحويل MP4 إلى صيغ متحركة بضغطة واحدة</p>
          </div>
          <div className="w-12 h-12 bg-sky-500/20 rounded-2xl flex items-center justify-center border border-sky-500/30">
            <Zap className="w-6 h-6 text-sky-400 fill-sky-400/20" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* Left Column: Upload & Formats */}
        <div className="xl:col-span-4 space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`h-64 rounded-[2.5rem] border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer group relative overflow-hidden ${file ? 'border-sky-500 bg-sky-500/5' : 'border-white/10 hover:border-sky-500/50 hover:bg-white/5'}`}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="video/mp4" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <div className="text-center p-6 relative z-10">
                <div className="w-20 h-20 bg-sky-500/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-sky-500/30">
                  <Film className="w-10 h-10 text-sky-400" />
                </div>
                <div className="text-white font-black truncate max-w-[200px] text-sm">{file.name}</div>
                <div className="text-sky-400 text-[10px] font-black mt-2 uppercase tracking-widest">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            ) : (
              <div className="text-center p-6 relative z-10">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-white/5 group-hover:scale-110 transition-transform">
                  <Video className="w-10 h-10 text-slate-400" />
                </div>
                <div className="text-white font-black text-sm">اضغط لرفع الفيديو</div>
                <div className="text-slate-500 text-[10px] font-bold mt-2 uppercase tracking-widest">MP4 فقط (أقل من 10 ثوانٍ)</div>
              </div>
            )}
          </div>

          <div className="bg-slate-950/40 p-6 rounded-[2.5rem] border border-white/5">
            <h4 className="text-white font-black mb-4 text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Layers className="w-3 h-3" />
              اختر صيغة التصدير:
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {formats.map(f => (
                <button 
                  key={f.id}
                  onClick={() => setSelectedFormat(f.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-right group ${selectedFormat === f.id ? 'bg-sky-500 border-sky-400 text-white shadow-glow-sky' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedFormat === f.id ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                    {f.id === 'VAP (MP4)' && <Video className="w-5 h-5" />}
                    {f.id === 'SVGA 2.0' && <Box className="w-5 h-5" />}
                    {f.id === 'GIF (Animation)' && <ImageIcon className="w-5 h-5" />}
                    {f.id === 'APNG (Animation)' && <Film className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">{f.name}</div>
                    <div className={`text-[9px] mt-0.5 ${selectedFormat === f.id ? 'text-white/70' : 'text-slate-500'}`}>{f.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Middle Column: Advanced Settings */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-slate-950/40 p-8 rounded-[3rem] border border-white/5 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-sky-400" />
                <span className="text-white font-black text-xs uppercase tracking-widest">إعدادات متقدمة</span>
              </div>
              <div className="px-3 py-1 bg-sky-500/10 text-sky-400 text-[9px] font-black rounded-lg border border-sky-500/20">ADVANCED MODE</div>
            </div>

            {/* Scale Inputs */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Maximize className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">أبعاد التصدير</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest block">العرض (Width)</label>
                  <input 
                    type="number" 
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value ? parseInt(e.target.value) : '')}
                    placeholder="تلقائي"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:border-sky-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest block">الارتفاع (Height)</label>
                  <input 
                    type="number" 
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value ? parseInt(e.target.value) : '')}
                    placeholder="تلقائي"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:border-sky-500 outline-none transition-all"
                  />
                </div>
              </div>
              {!customWidth && !customHeight && (
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">مقياس سريع</span>
                    <span className="text-sky-400 font-black text-xs">{Math.round(exportScale * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="2.0" step="0.1" value={exportScale} 
                    onChange={(e) => setExportScale(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                </div>
              )}
            </div>

            {/* Audio Upload */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Music className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">إضافة صوت (اختياري)</span>
              </div>
              <div 
                onClick={() => audioInputRef.current?.click()}
                className={`p-4 rounded-2xl border-2 border-dashed transition-all flex items-center gap-4 cursor-pointer ${audioFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'}`}
              >
                <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${audioFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>
                  <Music className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[10px] font-black truncate">{audioFile ? audioFile.name : 'اختر ملف صوتي'}</div>
                  <div className="text-slate-500 text-[8px] uppercase tracking-widest">{audioFile ? `${(audioFile.size / 1024).toFixed(1)} KB` : 'MP3, WAV...'}</div>
                </div>
                {audioFile && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setAudioFile(null); }}
                    className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Black Removal Toggle */}
            <button 
              onClick={() => setRemoveBlack(!removeBlack)}
              className={`w-full p-5 rounded-2xl border transition-all flex items-center justify-between group ${removeBlack ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500'}`}
            >
              <div className="flex items-center gap-3">
                <Moon className={`w-5 h-5 transition-colors ${removeBlack ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="font-black text-xs uppercase tracking-widest">إزالة الخلفية السوداء (تلقائي)</span>
              </div>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${removeBlack ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${removeBlack ? 'right-6' : 'right-1'}`}></div>
              </div>
            </button>

            {/* Edge Fade Sliders */}
            <div className="space-y-6 pt-4 border-t border-white/5">
              <h5 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                <Layers className="w-3 h-3" />
                تدرج الشفافية (Edge Fade)
              </h5>
              <div className="grid grid-cols-2 gap-6">
                {['top', 'bottom', 'left', 'right'].map((dir) => (
                  <div key={dir} className="space-y-3">
                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                      <span>{dir === 'top' ? 'أعلى' : dir === 'bottom' ? 'أسفل' : dir === 'left' ? 'يسار' : 'يمين'}</span>
                      <span className="text-sky-400">{fadeConfig[dir as keyof typeof fadeConfig]}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="50" value={fadeConfig[dir as keyof typeof fadeConfig]} 
                      onChange={(e) => setFadeConfig({...fadeConfig, [dir]: parseInt(e.target.value)})}
                      className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Action & Progress */}
        <div className="xl:col-span-3 flex flex-col justify-between gap-6">
          <div className="bg-gradient-to-br from-sky-500/10 to-indigo-600/10 p-8 rounded-[3rem] border border-sky-500/20 flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-sky-500/20 rounded-full flex items-center justify-center mb-6 border border-sky-500/30">
              <Download className="w-8 h-8 text-sky-400 animate-bounce" />
            </div>
            <h3 className="text-white font-black text-lg mb-2">جاهز للتحويل؟</h3>
            <p className="text-slate-400 text-[10px] leading-relaxed font-bold">سيتم تطبيق كافة إعدادات الشفافية والمقياس مباشرة على الملف الناتج.</p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={handleConvert}
              disabled={!file || isProcessing}
              className={`w-full py-6 rounded-[2.5rem] font-black text-lg transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-3 ${!file || isProcessing ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-glow-sky hover:shadow-glow-indigo'}`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>جاري المعالجة...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-white" />
                  <span>ابدأ التحويل الآن</span>
                </>
              )}
            </button>

            <AnimatePresence>
              {isProcessing && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sky-400 font-black text-[10px] uppercase tracking-widest">{phase}</span>
                    <span className="text-white font-black text-xs">{progress}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full shadow-glow-sky"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
