
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileMetadata, MaterialAsset, AppSettings, UserRecord, PresetBackground } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, increment, getDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Layers } from 'lucide-react';

declare var SVGA: any;
declare var JSZip: any;
declare var protobuf: any;
declare var pako: any;
declare var GIF: any;
declare var UPNG: any;

declare var WebMMuxer: any;

import { VapPlayer } from './VapPlayer';

interface WorkspaceProps {
  metadata: FileMetadata;
  onCancel: () => void;
  settings: AppSettings | null;
  currentUser: UserRecord | null;
}

interface CustomLayer {
  id: string;
  name: string;
  url: string;
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
  zIndexMode: 'front' | 'back';
}

const TRANSPARENT_PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const Workspace: React.FC<WorkspaceProps> = ({ metadata: initialMetadata, onCancel, settings, currentUser }) => {
  const [metadata, setMetadata] = useState<FileMetadata>(initialMetadata);
  const playerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('AE Project');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState('');
  const [svgaInstance, setSvgaInstance] = useState<any>(null);
  const [exportedVapUrl, setExportedVapUrl] = useState<string | null>(null);
  const [showVapHelp, setShowVapHelp] = useState(false);
  const [showFlutterCode, setShowFlutterCode] = useState(false);
  const [replacingAssetKey, setReplacingAssetKey] = useState<string | null>(null);
  const [layerImages, setLayerImages] = useState<Record<string, string>>({});
  const [assetColors, setAssetColors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [activeSideTab, setActiveSideTab] = useState<'layers' | 'transforms' | 'bg' | 'optimize'>('transforms');

  const [presetBgs, setPresetBgs] = useState<PresetBackground[]>([]);
  const [previewBg, setPreviewBg] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>('none');
  const [watermark, setWatermark] = useState<string | null>(null);
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  
  const [bgPos, setBgPos] = useState({ x: 50, y: 50 });
  const [bgScale, setBgScale] = useState(100);
  const [svgaPos, setSvgaPos] = useState({ x: 0, y: 0 });
  const [svgaScale, setSvgaScale] = useState(1);
  const [wmPos, setWmPos] = useState({ x: 0, y: 0 });
  const [wmScale, setWmScale] = useState(0.3);

  const [customLayers, setCustomLayers] = useState<CustomLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fadeConfig, setFadeConfig] = useState({ top: 0, bottom: 0, left: 0, right: 0 }); // Percentages 0-50
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [exportScale, setExportScale] = useState(1.0); // 0.1 to 1.0 for file size control
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [fadeModalTarget, setFadeModalTarget] = useState<string | null>(null);
  const [fadeModalValues, setFadeModalValues] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const videoWidth = metadata.dimensions?.width || 750;
  const videoHeight = metadata.dimensions?.height || 1334;
  const cost = settings?.costs.svgaProcess || 5;

  // ... (existing effects)

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const targetFps = parseInt(prompt("أدخل عدد الإطارات في الثانية (FPS):", "30") || "30");
      const targetQuality = parseFloat(prompt("أدخل جودة الصور (0.1 - 1.0):", "0.8") || "0.8");

      setIsProcessingVideo(true);
      setExportPhase('جاري معالجة الفيديو واستخراج الإطارات...');
      setIsExporting(true);

      try {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(file);
          video.muted = true;
          video.playsInline = true;
          await video.play();
          video.pause();
          
          const duration = video.duration;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const totalFrames = Math.floor(duration * targetFps);

          setAudioUrl(video.src);
          setOriginalAudioUrl(video.src);
          setAudioFile(file);

          const canvas = document.createElement('canvas');
          canvas.width = vw;
          canvas.height = vh;
          const ctx = canvas.getContext('2d');
          
          const newLayerImages: Record<string, string> = {};
          const newSprites: any[] = [];
          
          for (let i = 0; i < totalFrames; i++) {
              const time = i / targetFps;
              video.currentTime = time;
              await new Promise(r => {
                  const onSeek = () => { video.removeEventListener('seeked', onSeek); r(null); };
                  video.addEventListener('seeked', onSeek);
              });
              
              if (ctx && video.readyState >= 2) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const dataUrl = canvas.toDataURL('image/jpeg', targetQuality); // JPEG for video frames is smaller
                  const key = `v_frame_${i}`;
                  newLayerImages[key] = dataUrl;
                  
                  const frames = [];
                  for (let f = 0; f < totalFrames; f++) {
                      frames.push({
                          alpha: f === i ? 1.0 : 0.0,
                          layout: { x: 0, y: 0, width: canvas.width, height: canvas.height },
                          transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
                      });
                  }
                  
                  newSprites.push({
                      imageKey: key,
                      frames: frames,
                      matteKey: ""
                  });
              }
              if (i % 5 === 0) {
                  setProgress(Math.floor((i / totalFrames) * 100));
                  await new Promise(r => setTimeout(r, 0));
              }
          }

          setMetadata({
              ...metadata,
              name: file.name.replace('.mp4', ''),
              frames: totalFrames,
              fps: targetFps,
              dimensions: { width: canvas.width, height: canvas.height },
              videoItem: {
                  version: "2.0",
                  videoSize: { width: canvas.width, height: canvas.height },
                  FPS: targetFps,
                  frames: totalFrames,
                  images: newLayerImages,
                  sprites: newSprites,
                  audios: []
              }
          });
          
          setLayerImages(newLayerImages);
          setCustomLayers([]);
          setWatermark(null);
          
      } catch (e) {
          console.error(e);
          alert("فشل معالجة الفيديو");
      } finally {
          setIsProcessingVideo(false);
          setIsExporting(false);
          setProgress(0);
      }
  };

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = volume;
        audioRef.current.muted = isMuted;
        
        if (isPlaying && audioUrl) {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.log("Audio play prevented:", e));
            }
        } else {
            audioRef.current.pause();
        }
    }
  }, [isPlaying, audioUrl, volume, isMuted]);

  // Sync audio with animation frames
  useEffect(() => {
      if (audioRef.current && svgaInstance && metadata.fps) {
          let targetTime = currentFrame / metadata.fps;
          const duration = audioRef.current.duration;

          // Handle looping if audio is shorter than animation
          if (duration > 0 && !isNaN(duration)) {
              if (targetTime >= duration) {
                  targetTime = targetTime % duration;
              }
          }

          // Only sync if desynced by more than 0.2s to avoid stuttering
          // We also check if the difference is not due to natural looping (e.g. target is 0.1, current is 1.9 of 2.0s)
          const diff = Math.abs(audioRef.current.currentTime - targetTime);
          
          if (diff > 0.2) {
              // Special check: if we are near the loop boundary, don't force sync if it looks like a wrap-around
              // e.g. audio is at 1.9s (duration 2s), target is 0.1s. Diff is 1.8s.
              // We should let it play.
              const isLoopingWrap = duration > 0 && Math.abs(diff - duration) < 0.2;
              
              if (!isLoopingWrap) {
                  audioRef.current.currentTime = targetTime;
              }
          }
      }
  }, [currentFrame, metadata.fps]);

  useEffect(() => {
    const q = query(collection(db, "backgrounds"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setPresetBgs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PresetBackground[]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const maxWidth = parent.clientWidth;
          const maxHeight = window.innerHeight * 0.85; 
          const s = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
          setScale(s);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [videoWidth, videoHeight]);

  const checkAndDeductCoins = async (): Promise<boolean> => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    try {
      const userRef = doc(db, "users", currentUser.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data() as UserRecord;
        
        // 1. Check VIP
        if (userData.isVIP) {
            let expiryDate: Date | null = null;
            if (userData.subscriptionExpiry) {
                expiryDate = typeof userData.subscriptionExpiry.toDate === 'function' 
                    ? userData.subscriptionExpiry.toDate() 
                    : new Date(userData.subscriptionExpiry);
            }
            if (expiryDate && expiryDate > new Date()) return true;
        }

        // 2. Check Free Attempts
        if ((userData.freeAttempts || 0) > 0) {
            await updateDoc(userRef, { freeAttempts: increment(-1) });
            return true;
        }

        // 3. Check Coins
        if ((userData.coins || 0) < cost) {
          alert(`انتهت محاولاتك المجانية ورصيدك غير كافٍ. يرجى تفعيل كود اشتراك أو شحن رصيدك.`);
          return false;
        }
        await updateDoc(userRef, { coins: increment(-cost) });
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  const applyTransparencyEffects = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (fadeConfig.top === 0 && fadeConfig.bottom === 0 && fadeConfig.left === 0 && fadeConfig.right === 0) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const fadeTopLimit = (height * fadeConfig.top) / 100;
    const fadeBottomLimit = height - (height * fadeConfig.bottom) / 100;
    const fadeLeftLimit = (width * fadeConfig.left) / 100;
    const fadeRightLimit = width - (width * fadeConfig.right) / 100;

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);

      let a = data[i + 3];

      // Edge Fade Calculation
      let edgeAlpha = 1.0;
      if (fadeConfig.top > 0 && y < fadeTopLimit) edgeAlpha *= (y / fadeTopLimit);
      if (fadeConfig.bottom > 0 && y > fadeBottomLimit) edgeAlpha *= ((height - y) / (height - fadeBottomLimit));
      if (fadeConfig.left > 0 && x < fadeLeftLimit) edgeAlpha *= (x / fadeLeftLimit);
      if (fadeConfig.right > 0 && x > fadeRightLimit) edgeAlpha *= ((width - x) / (width - fadeRightLimit));

      const finalAlpha = (a / 255) * edgeAlpha;
      data[i + 3] = Math.round(finalAlpha * 255);
    }
    ctx.putImageData(imageData, 0, 0);
  }, [fadeConfig]);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeQuality, setOptimizeQuality] = useState(80);

  const compressAsset = useCallback(async (base64: string, quality: number): Promise<string> => {
    if (!base64 || base64 === TRANSPARENT_PIXEL) return base64;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
            
            if (quality < 100) {
                 const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                 const data = imageData.data;
                 const levels = Math.max(2, Math.floor((quality / 100) * 255));
                 const factor = 255 / (levels - 1);
                 
                 for (let i = 0; i < data.length; i += 4) {
                     data[i] = Math.round(Math.round(data[i] / factor) * factor);
                     data[i+1] = Math.round(Math.round(data[i+1] / factor) * factor);
                     data[i+2] = Math.round(Math.round(data[i+2] / factor) * factor);
                 }
                 ctx.putImageData(imageData, 0, 0);
            }
            
            const newDataUrl = canvas.toDataURL('image/png');
            // If new size is larger (due to PNG overhead), keep original
            if (newDataUrl.length < base64.length) {
                resolve(newDataUrl);
            } else {
                resolve(base64);
            }
        } else {
            resolve(base64);
        }
      };
      img.onerror = () => resolve(base64);
      img.src = base64;
    });
  }, []);

  const handleOptimizeAssets = async () => {
    if (isOptimizing) return;
    setIsOptimizing(true);
    
    let sizeBefore = 0;
    Object.values(layerImages).forEach(v => sizeBefore += (v as string).length);
    
    const newLayerImages = { ...layerImages };
    const keys = Object.keys(newLayerImages);
    
    for (const key of keys) {
        if (newLayerImages[key] === TRANSPARENT_PIXEL) continue;
        try {
            newLayerImages[key] = await compressAsset(newLayerImages[key], optimizeQuality);
        } catch (e) {
            console.error(e);
        }
    }
    
    let sizeAfter = 0;
    Object.values(newLayerImages).forEach(v => sizeAfter += (v as string).length);
    
    setLayerImages(newLayerImages);
    setIsOptimizing(false);
    
    const saved = ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(2);
    alert(`تم ضغط الصور بنجاح! تم تقليل الحجم بمقدار ${saved} MB`);
  };

  const extractImageData = useCallback(async (img: any): Promise<string> => {
    if (!img) return '';
    if (typeof img === 'string') return img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
    return new Promise((resolve) => {
      const processImage = (imgElement: HTMLImageElement | HTMLCanvasElement) => {
        try {
          const canvas = document.createElement('canvas');
          const w = (imgElement as HTMLImageElement).naturalWidth || imgElement.width || 200;
          const h = (imgElement as HTMLImageElement).naturalHeight || imgElement.height || 200;
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.drawImage(imgElement, 0, 0, w, h); resolve(canvas.toDataURL('image/png')); }
          else resolve('');
        } catch (e) { resolve(''); }
      };
      if (img instanceof HTMLImageElement) {
        if (img.complete && img.naturalWidth > 0) processImage(img);
        else { img.onload = () => processImage(img); img.onerror = () => resolve(''); }
      } else if (img instanceof HTMLCanvasElement) processImage(img);
      else resolve('');
    });
  }, []);

  const tintImage = useCallback(async (base64: string, color: string): Promise<string> => {
    if (!color || color === '#ffffff') return base64;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          ctx.globalCompositeOperation = 'source-atop';
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1.0;
          resolve(canvas.toDataURL('image/png'));
        } else resolve(base64);
      };
      img.src = base64;
    });
  }, []);

  const getProcessedAsset = useCallback(async (key: string): Promise<string> => {
    const base64 = layerImages[key];
    if (!base64) return TRANSPARENT_PIXEL;
    const color = assetColors[key];
    if (color && color !== '#ffffff') {
      return await tintImage(base64, color);
    }
    return base64;
  }, [layerImages, assetColors, tintImage]);

  useEffect(() => {
    if (!metadata.videoItem) return;
    const fetchAssets = async () => {
      setAssetsLoading(true);
      const extractedImages: Record<string, string> = {};
      const sourceImages = metadata.videoItem.images || {};
      
      // Identify audio keys to skip during image extraction
      const audioKeys = new Set<string>();
      if (metadata.videoItem.audios) {
          metadata.videoItem.audios.forEach((audio: any) => {
              if (audio.audioKey) audioKeys.add(audio.audioKey);
          });
      }

      for (const key of Object.keys(sourceImages)) {
        if (audioKeys.has(key)) continue;
        const data = await extractImageData(sourceImages[key]);
        if (data) extractedImages[key] = data;
      }
      setLayerImages(extractedImages);

      // Extract Audio
      if (metadata.videoItem.audios && metadata.videoItem.audios.length > 0) {
          const audioObj = metadata.videoItem.audios[0];
          const audioKey = audioObj.audioKey;
          const rawAudio = sourceImages[audioKey];
          
          if (rawAudio) {
             let url = '';
             try {
                 if (typeof rawAudio === 'string') {
                     let binaryString = rawAudio;
                     if (rawAudio.startsWith('data:audio')) {
                         binaryString = atob(rawAudio.split(',')[1]);
                     } else if (rawAudio.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(rawAudio)) {
                         // Likely base64
                         try {
                             binaryString = atob(rawAudio);
                         } catch (e) {
                             // Not base64, treat as binary string
                             binaryString = rawAudio;
                         }
                     }
                     
                     const bytes = new Uint8Array(binaryString.length);
                     for (let i = 0; i < binaryString.length; i++) {
                         bytes[i] = binaryString.charCodeAt(i);
                     }
                     const blob = new Blob([bytes], { type: 'audio/mp3' });
                     url = URL.createObjectURL(blob);
                 } else if (rawAudio instanceof Uint8Array) {
                     const blob = new Blob([rawAudio], { type: 'audio/mp3' });
                     url = URL.createObjectURL(blob);
                 }
             } catch (e) {
                 console.error("Error extracting audio:", e);
             }
             
             if (url) {
                 setAudioUrl(url);
                 setOriginalAudioUrl(url);
             }
          }
      } else if (metadata.type === 'MP4' && metadata.fileUrl) {
          // Fallback for MP4: Use the fileUrl as audio source
          setAudioUrl(metadata.fileUrl);
          setOriginalAudioUrl(metadata.fileUrl);
      }

      setAssetsLoading(false);
    };
    fetchAssets();
  }, [metadata.videoItem, extractImageData, metadata.type, metadata.fileUrl]);

  useEffect(() => {
    let player: any = null;
    if (playerRef.current && metadata.videoItem && typeof SVGA !== 'undefined') {
      playerRef.current.innerHTML = '';
      player = new SVGA.Player(playerRef.current);
      player.loops = 0; player.clearsAfterStop = false;
      player.setContentMode('AspectFit'); 
      player.setVideoItem(metadata.videoItem);
      player.startAnimation();
      player.onFrame((frame: number) => setCurrentFrame(frame));
      setSvgaInstance(player);
      return () => { if (player) { player.stopAnimation(); player.clear(); } };
    }
  }, [metadata.videoItem]);

  const handleOpenFadeModal = (key: string) => {
    setFadeModalTarget(key);
    setFadeModalValues({ top: 0, bottom: 0, left: 0, right: 0 });
  };

  const handleApplyFade = async () => {
    if (!fadeModalTarget || !layerImages[fadeModalTarget]) return;

    const img = new Image();
    img.src = layerImages[fadeModalTarget];
    await new Promise(r => img.onload = r);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Apply Fade (Destination Out)
    ctx.globalCompositeOperation = 'destination-out';

    const w = canvas.width;
    const h = canvas.height;
    const { top, bottom, left, right } = fadeModalValues;

    if (left > 0) {
        const fadeW = w * (left / 100);
        const g = ctx.createLinearGradient(0, 0, fadeW, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, fadeW, h);
    }
    if (right > 0) {
        const fadeW = w * (right / 100);
        const g = ctx.createLinearGradient(w, 0, w - fadeW, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(w - fadeW, 0, fadeW, h);
    }
    if (top > 0) {
        const fadeH = h * (top / 100);
        const g = ctx.createLinearGradient(0, 0, 0, fadeH);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, fadeH);
    }
    if (bottom > 0) {
        const fadeH = h * (bottom / 100);
        const g = ctx.createLinearGradient(0, h, 0, h - fadeH);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, h - fadeH, w, fadeH);
    }

    const newDataUrl = canvas.toDataURL('image/png');
    
    setLayerImages(prev => ({
        ...prev,
        [fadeModalTarget]: newDataUrl
    }));
    
    // Update metadata
    const binary = atob(newDataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const newMetadata = {
        ...metadata,
        videoItem: {
            ...metadata.videoItem,
            images: {
                ...metadata.videoItem.images,
                [fadeModalTarget]: bytes
            }
        }
    };
    setMetadata(newMetadata);
    setFadeModalTarget(null);
  };

  const handleBakeLayer = async (targetKey: string) => {
    if (!metadata.videoItem || !layerImages[targetKey]) return;
    
    // Find the sprite using this image
    const targetSpriteIndex = (metadata.videoItem.sprites || []).findIndex((s: any) => s.imageKey === targetKey);
    if (targetSpriteIndex === -1) {
        alert("لم يتم العثور على عنصر متحرك يستخدم هذه الصورة.");
        return;
    }
    
    const targetSprite = metadata.videoItem.sprites[targetSpriteIndex];
    if (!confirm(`هل تريد تحويل العنصر "${targetKey}" إلى سلسلة صور (Frame Sequence)؟\n\nسيتم:\n1. استبدال العنصر الأصلي بـ ${metadata.frames} طبقة (واحدة لكل إطار).\n2. دمج الحركة في الصور لتقليل المعالجة.\n3. ضغط الصور لتقليل الحجم.\n\nهذه العملية قد تستغرق وقتاً.`)) return;

    setIsExporting(true);
    setExportPhase(`جاري معالجة العنصر ${targetKey}...`);

    try {
        const totalFrames = metadata.frames || 0;
        const newImages: Record<string, string> = { ...layerImages };
        const currentSprites = [...(metadata.videoItem.sprites || [])];
        
        const sourceImg = new Image();
        sourceImg.src = layerImages[targetKey];
        await new Promise(r => sourceImg.onload = r);

        const generatedSprites: any[] = [];
        const viewBoxWidth = metadata.dimensions?.width || 750;
        const viewBoxHeight = metadata.dimensions?.height || 750;

        for (let i = 0; i < totalFrames; i++) {
            const frame = targetSprite.frames[i];
            
            // Skip invisible frames
            if (!frame || frame.alpha <= 0.01) continue;

            const t = frame.transform || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
            const l = frame.layout || { x: 0, y: 0, width: sourceImg.width, height: sourceImg.height };

            // Calculate exact transformed bounding box in viewBox space
            const points = [
                { x: l.x, y: l.y },
                { x: l.x + l.width, y: l.y },
                { x: l.x, y: l.y + l.height },
                { x: l.x + l.width, y: l.y + l.height }
            ];

            const transformedPoints = points.map(p => ({
                x: t.a * p.x + t.c * p.y + t.tx,
                y: t.b * p.x + t.d * p.y + t.ty
            }));

            const minX = Math.floor(Math.min(...transformedPoints.map(p => p.x)));
            const minY = Math.floor(Math.min(...transformedPoints.map(p => p.y)));
            const maxX = Math.ceil(Math.max(...transformedPoints.map(p => p.x)));
            const maxY = Math.ceil(Math.max(...transformedPoints.map(p => p.y)));
            
            const width = Math.max(1, maxX - minX);
            const height = Math.max(1, maxY - minY);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (ctx && sourceImg.complete && sourceImg.naturalWidth > 0) {
                // Align the transformed sprite into the new canvas
                ctx.translate(-minX, -minY);
                ctx.transform(t.a, t.b, t.c, t.d, t.tx, t.ty);
                ctx.drawImage(sourceImg, l.x, l.y, l.width, l.height);
                
                let dataUrl = canvas.toDataURL('image/png');
                dataUrl = await compressAsset(dataUrl, optimizeQuality);

                const newKey = `baked_${targetKey}_${i}`;
                newImages[newKey] = dataUrl;

                const spriteFrames = [];
                for (let f = 0; f < totalFrames; f++) {
                    spriteFrames.push({
                        alpha: f === i ? (frame.alpha || 1.0) : 0.0,
                        layout: { x: minX, y: minY, width: width, height: height },
                        transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
                        blendMode: frame.blendMode,
                        clipPath: frame.clipPath
                    });
                }
                
                generatedSprites.push({
                    imageKey: newKey,
                    frames: spriteFrames,
                    matteKey: targetSprite.matteKey
                });
            }
            
            if (i % 5 === 0) {
                setProgress(Math.floor(((i + 1) / totalFrames) * 100));
                await new Promise(r => setTimeout(r, 0)); // Prevent UI freeze
            }
        }

        currentSprites.splice(targetSpriteIndex, 1, ...generatedSprites);

        const newMetadata = {
            ...metadata,
            videoItem: {
                ...metadata.videoItem,
                images: newImages,
                sprites: currentSprites
            }
        };

        setLayerImages(newImages);
        setMetadata(newMetadata);
        
        if (deletedKeys.has(targetKey)) {
             const next = new Set(deletedKeys);
             next.delete(targetKey);
             setDeletedKeys(next);
        }

        alert(`تم تحويل العنصر بنجاح! تم الحفاظ على الأبعاد والحركة بدقة.`);

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء تحويل العنصر.");
    } finally {
        setIsExporting(false);
        setProgress(0);
    }
  };

  const handlePlayToggle = () => {
    if (!svgaInstance) return;
    if (isPlaying) svgaInstance.pauseAnimation();
    else svgaInstance.startAnimation();
    setIsPlaying(!isPlaying);
  };

  const filteredKeys = useMemo(() => {
    return Object.keys(layerImages)
      .filter(key => key.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0'));
  }, [layerImages, searchQuery]);

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target?.result as string;
            if (replacingAssetKey) {
                setLayerImages(p => ({ ...p, [replacingAssetKey]: base64 }));
                const color = assetColors[replacingAssetKey];
                const finalImage = color ? await tintImage(base64, color) : base64;
                svgaInstance?.setImage(finalImage, replacingAssetKey);
                setReplacingAssetKey(null);
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const handleColorChange = async (key: string, color: string) => {
    setAssetColors(p => ({ ...p, [key]: color }));
    if (svgaInstance && !deletedKeys.has(key)) {
      const finalImage = await tintImage(layerImages[key], color);
      svgaInstance.setImage(finalImage, key);
    }
  };

  const handleDownloadLayer = (key: string) => {
    const base64 = layerImages[key];
    if (base64) {
      const link = document.createElement("a");
      link.href = base64;
      link.download = `${key}.png`;
      link.click();
    }
  };

  const handleDeleteAsset = (key: string) => {
    if (deletedKeys.has(key)) {
        setDeletedKeys(p => { const next = new Set(p); next.delete(key); return next; });
        if (svgaInstance) {
            const color = assetColors[key];
            if (color) tintImage(layerImages[key], color).then(tinted => svgaInstance.setImage(tinted, key));
            else svgaInstance.setImage(layerImages[key], key);
        }
    } else {
        setDeletedKeys(p => new Set(p).add(key));
        if (svgaInstance) svgaInstance.setImage(TRANSPARENT_PIXEL, key);
    }
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => { 
        setPreviewBg(ev.target?.result as string); setBgScale(100); setBgPos({ x: 50, y: 50 }); setActivePreset('custom');
      };
      reader.readAsDataURL(file);
    }
  };

  const selectPresetBg = (bg: PresetBackground | null) => {
    if (!bg) { setActivePreset('none'); setPreviewBg(null); }
    else { setActivePreset(bg.id); setPreviewBg(bg.url); setBgScale(100); setBgPos({ x: 50, y: 50 }); }
  };

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => { setWatermark(ev.target?.result as string); setWmPos({ x: 0, y: 0 }); setWmScale(0.3); };
      reader.readAsDataURL(file);
    }
  };

  const getImageSize = (base64: string): Promise<{w: number, h: number}> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.src = base64;
    });
  };

  const handleAddLayer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const url = ev.target?.result as string;
        const size = await getImageSize(url);
        const newLayer: CustomLayer = {
          id: `layer_${Date.now()}`,
          name: file.name,
          url,
          x: (videoWidth - size.w) / 2,
          y: (videoHeight - size.h) / 2,
          scale: 1,
          width: size.w,
          height: size.h,
          zIndexMode: 'front'
        };
        setCustomLayers(prev => [...prev, newLayer]);
        setSelectedLayerId(newLayer.id);
        setActiveSideTab('transforms');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateLayer = (id: string, updates: Partial<CustomLayer>) => {
    setCustomLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    setCustomLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index < prev.length - 1) {
        const newArr = [...prev];
        [newArr[index], newArr[index + 1]] = [newArr[index + 1], newArr[index]];
        return newArr;
      }
      if (direction === 'down' && index > 0) {
        const newArr = [...prev];
        [newArr[index], newArr[index - 1]] = [newArr[index - 1], newArr[index]];
        return newArr;
      }
      return prev;
    });
  };

  const handleRemoveLayer = (id: string) => {
    if (confirm("حذف هذه الطبقة؟")) {
        setCustomLayers(prev => prev.filter(l => l.id !== id));
        if (selectedLayerId === id) setSelectedLayerId(null);
    }
  };

  const handleExportAEProject = async () => {
    if (!svgaInstance) return;
    const canProceed = await checkAndDeductCoins();
    if (!canProceed) return;

    setIsExporting(true);
    setExportPhase('تحليل مصفوفة الطبقات Quantum v5.6...');
    try {
      const zip = new JSZip();
      const assetsFolder = zip.folder("assets");
      const imagesMapping: Record<string, string> = {};
      const keys = Object.keys(layerImages);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (deletedKeys.has(key)) continue;
        const processedBase64 = await getProcessedAsset(key);
        const fileName = `${key}.png`;
        assetsFolder.file(fileName, processedBase64.split(',')[1], { base64: true });
        imagesMapping[key] = fileName;
        setProgress(Math.floor((i / keys.length) * 30));
      }

      if (previewBg) zip.file(`background.png`, previewBg.split(',')[1], { base64: true });
      if (watermark) zip.file(`watermark.png`, watermark.split(',')[1], { base64: true });

      const sprites = (metadata.videoItem.sprites || []).filter((s: any) => !deletedKeys.has(s.imageKey));
      const manifest = {
        version: "5.6-QUANTUM-SYNC",
        width: videoWidth,
        height: videoHeight,
        fps: metadata.fps || 30,
        frames: metadata.frames || 0,
        adjustments: {
            svga: { pos: svgaPos, scale: svgaScale },
            bg: { pos: bgPos, scale: bgScale, exists: !!previewBg },
            wm: { pos: wmPos, scale: wmScale, exists: !!watermark }
        },
        sprites: sprites.map((s: any) => ({
          imageKey: s.imageKey,
          frames: s.frames.map((f: any) => ({
            a: f.alpha,
            l: f.layout,
            t: f.transform
          }))
        }))
      };

      const jsxContent = `
if (!this.JSON) { this.JSON = {}; }
(function () {
    'use strict';
    var cx = /[\\u0000\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]/g;
    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text) {
            var j; text = String(text); cx.lastIndex = 0;
            if (cx.test(text)) { text = text.replace(cx, function (a) { return '\\\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4); }); }
            j = eval('(' + text + ')'); return j;
        };
    }
}());

(function() {
    var data = ${JSON.stringify(manifest)};
    app.beginUndoGroup("Quantum SVGA Rebuild v5.6");
    var mainComp = app.project.items.addComp("Quantum_Animation_Suite", data.width, data.height, 1.0, data.frames / data.fps, data.fps);
    mainComp.bgColor = [0,0,0];
    var masterNull = mainComp.layers.addNull();
    masterNull.name = "GLOBAL_SVGA_TRANSFORM";
    masterNull.position.setValue([data.width/2 + data.adjustments.svga.pos.x, data.height/2 + data.adjustments.svga.pos.y]);
    masterNull.scale.setValue([data.adjustments.svga.scale * 100, data.adjustments.svga.scale * 100]);
    var assetsFolder = Folder.selectDialog("اختر مجلد assets المستخرج");
    if (!assetsFolder) { app.endUndoGroup(); return; }
    for (var i = 0; i < data.sprites.length; i++) {
        var sprite = data.sprites[i];
        var imgFile = File(assetsFolder.fsName + "/" + sprite.imageKey + ".png");
        if (!imgFile.exists) continue;
        var footage = app.project.importFile(new ImportOptions(imgFile));
        var layer = mainComp.layers.add(footage);
        layer.name = "Layer_" + i + "_" + sprite.imageKey;
        layer.parent = masterNull;
        layer.anchorPoint.setValue([footage.width/2, footage.height/2]);
        for (var f = 0; f < sprite.frames.length; f++) {
            var frame = sprite.frames[f];
            var time = f / data.fps;
            var centerX = footage.width / 2;
            var centerY = footage.height / 2;
            var finalX, finalY;
            var opKey = layer.opacity.addKey(time);
            layer.opacity.setValueAtKey(opKey, frame.a * 100);
            layer.opacity.setInterpolationTypeAtKey(opKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
            if (frame.t) {
                var t = frame.t;
                finalX = t.a * centerX + t.c * centerY + t.tx + frame.l.x;
                finalY = t.b * centerX + t.d * centerY + t.ty + frame.l.y;
                var sx = Math.sqrt(t.a * t.a + t.b * t.b) * 100;
                var sy = Math.sqrt(t.c * t.c + t.d * t.d) * 100;
                var rot = Math.atan2(t.b, t.a) * 180 / Math.PI;
                var scaleKey = layer.scale.addKey(time);
                layer.scale.setValueAtKey(scaleKey, [sx, sy]);
                layer.scale.setInterpolationTypeAtKey(scaleKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                var rotKey = layer.rotation.addKey(time);
                layer.rotation.setValueAtKey(rotKey, rot);
                layer.rotation.setInterpolationTypeAtKey(rotKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
            } else {
                finalX = frame.l.x + centerX;
                finalY = frame.l.y + centerY;
                var scaleKey = layer.scale.addKey(time);
                layer.scale.setValueAtKey(scaleKey, [100, 100]);
                layer.scale.setInterpolationTypeAtKey(scaleKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                var rotKey = layer.rotation.addKey(time);
                layer.rotation.setValueAtKey(rotKey, 0);
                layer.rotation.setInterpolationTypeAtKey(rotKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
            }
            var posKey = layer.position.addKey(time);
            layer.position.setValueAtKey(posKey, [finalX, finalY]);
            layer.position.setInterpolationTypeAtKey(posKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        }
    }
    var projectFolder = assetsFolder.parent;
    if (data.adjustments.bg.exists) {
        var bgFile = File(projectFolder.fsName + "/background.png");
        if (bgFile.exists) {
            var bgL = mainComp.layers.add(app.project.importFile(new ImportOptions(bgFile)));
            bgL.name = "Quantum_Background";
            bgL.moveToEnd();
            bgL.scale.setValue([data.adjustments.bg.scale, data.adjustments.bg.scale]);
            bgL.position.setValue([data.width * (data.adjustments.bg.pos.x/100), data.height * (data.adjustments.bg.pos.y/100)]);
        }
    }
    if (data.adjustments.wm.exists) {
        var wmFile = File(projectFolder.fsName + "/watermark.png");
        if (wmFile.exists) {
            var wmL = mainComp.layers.add(app.project.importFile(new ImportOptions(wmFile)));
            wmL.name = "Quantum_Watermark";
            wmL.moveToBeginning();
            wmL.position.setValue([data.width/2 + data.adjustments.wm.pos.x, data.height/2 + data.adjustments.wm.pos.y]);
            var ws = data.adjustments.wm.scale * 100;
            wmL.scale.setValue([ws, ws]);
        }
    }
    app.endUndoGroup();
    alert("✅ اكتمل البناء الكمي v5.6!");
})();
      `;

      zip.file("build_animation.jsx", jsxContent);
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${metadata.name.replace('.svga','')}_PrecisionAE_v5.6.zip`;
      link.click();
      setProgress(100);
    } catch (e) { console.error(e); } finally { setTimeout(() => setIsExporting(false), 800); }
  };

  const handleExportImageSequence = async () => {
    if (!svgaInstance || !playerRef.current) return;
    const canProceed = await checkAndDeductCoins();
    if (!canProceed) return;

    setIsExporting(true);
    setExportPhase('جاري تصدير تسلسل الصور...');
    
    try {
      const zip = new JSZip();
      const folder = zip.folder("sequence");
      const totalFrames = metadata.frames || 0;
      
      svgaInstance.pauseAnimation();

      const canvas = playerRef.current.querySelector('canvas');
      if (!canvas) throw new Error("Canvas not found");

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

      const originalFrame = currentFrame;

      for (let i = 0; i < totalFrames; i++) {
        svgaInstance.stepToFrame(i, true);
        await new Promise(resolve => setTimeout(resolve, 30));
        
        const currentCanvas = playerRef.current?.querySelector('canvas');
        if (currentCanvas && tCtx) {
            tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            tCtx.drawImage(currentCanvas, 0, 0);
            applyTransparencyEffects(tCtx, tempCanvas.width, tempCanvas.height);
            
            const dataUrl = tempCanvas.toDataURL("image/png");
            const base64 = dataUrl.split(',')[1];
            folder.file(`frame_${String(i).padStart(5, '0')}.png`, base64, { base64: true });
        }
        
        setProgress(Math.floor(((i + 1) / totalFrames) * 100));
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${metadata.name.replace('.svga','')}_Sequence.zip`;
      link.click();
      
      svgaInstance.stepToFrame(originalFrame, true);
      
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء تصدير الصور");
    } finally {
      setIsExporting(false);
      if (isPlaying) svgaInstance.startAnimation();
    }
  };

  const handleExportGIF = async () => {
    if (!svgaInstance || !playerRef.current) return;
    const canProceed = await checkAndDeductCoins();
    if (!canProceed) return;

    setIsExporting(true);
    setExportPhase('جاري إنشاء ملف GIF شفاف...');

    try {
        svgaInstance.pauseAnimation();
        const originalFrame = currentFrame;
        const totalFrames = metadata.frames || 0;
        const fps = metadata.fps || 30;
        const canvas = playerRef.current.querySelector('canvas');
        if (!canvas) throw new Error("Canvas not found");

        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: canvas.width,
            height: canvas.height,
            workerScript: '/gif.worker.js',
            transparent: 0x00FF00
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        for (let i = 0; i < totalFrames; i++) {
            svgaInstance.stepToFrame(i, true);
            await new Promise(r => setTimeout(r, 30));
            
            const currentCanvas = playerRef.current?.querySelector('canvas');
            if (tCtx && currentCanvas) {
                tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                tCtx.drawImage(currentCanvas, 0, 0);
                
                applyTransparencyEffects(tCtx, tempCanvas.width, tempCanvas.height);

                const imageData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const data = imageData.data;
                
                for (let j = 0; j < data.length; j += 4) {
                    const a = data[j + 3];
                    if (a < 50) {
                        // Make it Green (Transparent Key)
                        data[j] = 0;
                        data[j + 1] = 255;
                        data[j + 2] = 0;
                        data[j + 3] = 255;
                    } else {
                        // Make it Opaque (Remove semi-transparency)
                        data[j + 3] = 255;
                    }
                }
                tCtx.putImageData(imageData, 0, 0);
                
                gif.addFrame(tempCanvas, { delay: 1000 / fps, copy: true });
            }
            setProgress(Math.floor(((i + 1) / totalFrames) * 50));
        }

        setExportPhase('جاري معالجة GIF (Rendering)...');
        
        gif.on('progress', (p: number) => {
            setProgress(50 + Math.floor(p * 50));
        });

        gif.on('finished', (blob: Blob) => {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${metadata.name.replace('.svga', '')}_Transparent.gif`;
            link.click();
            setIsExporting(false);
            svgaInstance.stepToFrame(originalFrame, true);
            if (isPlaying) svgaInstance.startAnimation();
        });

        gif.render();

    } catch (e) {
        console.error(e);
        alert("فشل تصدير GIF");
        setIsExporting(false);
    }
  };

  const handleExportWebP = async () => {
    if (!svgaInstance || !playerRef.current) return;
    const canProceed = await checkAndDeductCoins();
    if (!canProceed) return;

    setIsExporting(true);
    setExportPhase('جاري تحضير الأصول...');

    try {
        svgaInstance.pauseAnimation();
        const originalFrame = currentFrame;
        const totalFrames = metadata.frames || 0;
        const fps = metadata.fps || 30;
        
        // Use video dimensions for consistency
        const safeWidth = videoWidth;
        const safeHeight = videoHeight;

        // Helper to load image
        const loadImage = (src: string): Promise<HTMLImageElement> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = () => resolve(img);
                img.src = src;
            });
        };

        // Load assets
        let bgImg: HTMLImageElement | null = null;
        if (previewBg) bgImg = await loadImage(previewBg);
        
        let wmImg: HTMLImageElement | null = null;
        if (watermark) wmImg = await loadImage(watermark);

        const loadedLayers = await Promise.all(customLayers.map(async l => {
            const img = await loadImage(l.url);
            return { ...l, img };
        }));

        // Composition Canvas
        const compCanvas = document.createElement('canvas');
        compCanvas.width = safeWidth;
        compCanvas.height = safeHeight;
        const cCtx = compCanvas.getContext('2d', { willReadFrequently: true });
        if (!cCtx) throw new Error("Failed to create context");

        // Check if VideoEncoder supports Alpha with VP9
        let supportAlpha = false;
        try {
            const config = {
                codec: 'vp09.00.10.08',
                width: safeWidth,
                height: safeHeight,
                bitrate: 2000000,
                alpha: 'keep' as const
            };
            // @ts-ignore
            const support = await VideoEncoder.isConfigSupported(config);
            if (support.supported) {
                supportAlpha = true;
            }
        } catch (e) {
            console.log("Alpha check failed", e);
        }

        if (!supportAlpha) {
             console.warn("Alpha encoding not supported, falling back to APNG");
             setExportPhase('الشفافية غير مدعومة للفيديو، جاري التحويل إلى APNG...');
             await new Promise(r => setTimeout(r, 1000));
             handleExportAPNG();
             return;
        }

        const muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: {
                codec: 'V_VP9',
                width: safeWidth,
                height: safeHeight,
                frameRate: fps,
                alpha: true
            }
        });

        let hasError = false;
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => {
                console.error("VideoEncoder Error:", e);
                hasError = true;
            }
        });

        videoEncoder.configure({
            codec: 'vp09.00.10.08',
            width: safeWidth,
            height: safeHeight,
            bitrate: 2000000,
            alpha: 'keep'
        });

        setExportPhase('جاري إنشاء WebP متحرك (WebM Container)...');

        for (let i = 0; i < totalFrames; i++) {
            if (hasError || videoEncoder.state !== 'configured') {
                throw new Error("VideoEncoder configuration failed or crashed");
            }

            svgaInstance.stepToFrame(i, true);
            await new Promise(r => setTimeout(r, 30));
            
            const currentCanvas = playerRef.current?.querySelector('canvas');
            if (!currentCanvas) continue;

            // Render Composition
            cCtx.clearRect(0, 0, safeWidth, safeHeight);

            // 1. Background
            if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                const bgW = (safeWidth * bgScale) / 100;
                const bgH = bgW * (bgImg.height / bgImg.width);
                const bgX = (safeWidth - bgW) * (bgPos.x / 100);
                const bgY = (safeHeight - bgH) * (bgPos.y / 100);
                cCtx.drawImage(bgImg, bgX, bgY, bgW, bgH);
            }

            // 2. Back Layers
            loadedLayers.filter(l => l.zIndexMode === 'back').forEach(l => {
                if (l.img.complete && l.img.naturalWidth > 0) {
                    cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
                }
            });

            // 3. SVGA
            const cx = safeWidth / 2;
            const cy = safeHeight / 2;
            cCtx.save();
            cCtx.translate(cx + svgaPos.x, cy + svgaPos.y);
            cCtx.scale(svgaScale, svgaScale);
            cCtx.translate(-cx, -cy);
            cCtx.drawImage(currentCanvas, 0, 0);
            cCtx.restore();

            // 4. Watermark
            if (wmImg && wmImg.complete && wmImg.naturalWidth > 0) {
                const wmW = safeWidth * wmScale;
                const wmH = wmW * (wmImg.height / wmImg.width);
                const wmX = (safeWidth - wmW) / 2 + wmPos.x;
                const wmY = (safeHeight - wmH) / 2 + wmPos.y;
                cCtx.globalAlpha = 0.7;
                cCtx.drawImage(wmImg, wmX, wmY, wmW, wmH);
                cCtx.globalAlpha = 1.0;
            }

            // 5. Front Layers
            loadedLayers.filter(l => l.zIndexMode === 'front').forEach(l => {
                if (l.img.complete && l.img.naturalWidth > 0) {
                    cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
                }
            });

            const bitmap = await createImageBitmap(compCanvas);
            const frame = new VideoFrame(bitmap, { timestamp: (i * 1000000) / fps });
            
            try {
                videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
            } catch (encodeError) {
                frame.close();
                bitmap.close();
                throw encodeError;
            }
            
            frame.close();
            bitmap.close();
            
            setProgress(Math.floor(((i + 1) / totalFrames) * 90));
        }

        await videoEncoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/webm' });
        
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${metadata.name.replace('.svga', '')}_Animated.webm`;
        link.click();

        setIsExporting(false);
        svgaInstance.stepToFrame(originalFrame, true);
        if (isPlaying) svgaInstance.startAnimation();

    } catch (e) {
        console.error("Export failed:", e);
        setExportPhase('فشل تصدير الفيديو، جاري المحاولة بصيغة APNG...');
        await new Promise(r => setTimeout(r, 1000));
        handleExportAPNG();
    }
  };


  const handleExportAPNG = async () => {
    if (!svgaInstance || !playerRef.current) return;
    const canProceed = await checkAndDeductCoins();
    if (!canProceed) return;

    setIsExporting(true);
    setExportPhase('جاري إنشاء ملف APNG (Animation)...');

    try {
        svgaInstance.pauseAnimation();
        const originalFrame = currentFrame;
        const totalFrames = metadata.frames || 0;
        const fps = metadata.fps || 30;
        const canvas = playerRef.current.querySelector('canvas');
        if (!canvas) throw new Error("Canvas not found");

        const framesData: ArrayBuffer[] = [];
        const delays: number[] = [];
        const delay = Math.round(1000 / fps);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        for (let i = 0; i < totalFrames; i++) {
            svgaInstance.stepToFrame(i, true);
            await new Promise(r => setTimeout(r, 30));
            
            const currentCanvas = playerRef.current?.querySelector('canvas');
            if (currentCanvas && tCtx) {
                tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                tCtx.drawImage(currentCanvas, 0, 0);
                applyTransparencyEffects(tCtx, tempCanvas.width, tempCanvas.height);

                const imageData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                framesData.push(imageData.data.buffer);
                delays.push(delay);
            }
            setProgress(Math.floor(((i + 1) / totalFrames) * 80));
        }

        setExportPhase('جاري ضغط APNG...');
        
        // UPNG.encode(imgs, w, h, cnum, dels)
        // cnum = 0 for lossless
        const apngBuffer = UPNG.encode(framesData, canvas.width, canvas.height, 0, delays);
        
        const blob = new Blob([apngBuffer], { type: 'image/png' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${metadata.name.replace('.svga', '')}_Animation.png`;
        link.click();

        setIsExporting(false);
        svgaInstance.stepToFrame(originalFrame, true);
        if (isPlaying) svgaInstance.startAnimation();

    } catch (e) {
        console.error(e);
        alert("فشل تصدير APNG");
        setIsExporting(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setAudioFile(file);
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        // Reset input value to allow re-uploading same file
        e.target.value = '';
    }
  };

  const handleDownloadFrame = async () => {
    if (!playerRef.current) return;

    // Helper to load image
    const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img);
            img.src = src;
        });
    };

    // Load assets
    let bgImg: HTMLImageElement | null = null;
    if (previewBg) bgImg = await loadImage(previewBg);
    
    let wmImg: HTMLImageElement | null = null;
    if (watermark) wmImg = await loadImage(watermark);

    const loadedLayers = await Promise.all(customLayers.map(async l => {
        const img = await loadImage(l.url);
        return { ...l, img };
    }));

    const safeWidth = videoWidth;
    const safeHeight = videoHeight;
    const compCanvas = document.createElement('canvas');
    compCanvas.width = safeWidth;
    compCanvas.height = safeHeight;
    const cCtx = compCanvas.getContext('2d');
    if (!cCtx) return;

    // 1. Background
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        const bgW = (safeWidth * bgScale) / 100;
        const bgH = bgW * (bgImg.height / bgImg.width);
        const bgX = (safeWidth - bgW) * (bgPos.x / 100);
        const bgY = (safeHeight - bgH) * (bgPos.y / 100);
        cCtx.drawImage(bgImg, bgX, bgY, bgW, bgH);
    }

    // 2. Back Layers
    loadedLayers.filter(l => l.zIndexMode === 'back').forEach(l => {
        if (l.img.complete && l.img.naturalWidth > 0) {
            cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
        }
    });

    // 3. SVGA
    const currentCanvas = playerRef.current.querySelector('canvas');
    if (currentCanvas) {
        const cx = safeWidth / 2;
        const cy = safeHeight / 2;
        cCtx.save();
        cCtx.translate(cx + svgaPos.x, cy + svgaPos.y);
        cCtx.scale(svgaScale, svgaScale);
        cCtx.translate(-cx, -cy);
        cCtx.drawImage(currentCanvas, 0, 0);
        cCtx.restore();
    }

    // 4. Watermark
    if (wmImg && wmImg.complete && wmImg.naturalWidth > 0) {
        const wmW = safeWidth * wmScale;
        const wmH = wmW * (wmImg.height / wmImg.width);
        const wmX = (safeWidth - wmW) / 2 + wmPos.x;
        const wmY = (safeHeight - wmH) / 2 + wmPos.y;
        cCtx.globalAlpha = 0.7;
        cCtx.drawImage(wmImg, wmX, wmY, wmW, wmH);
        cCtx.globalAlpha = 1.0;
    }

    // 5. Front Layers
    loadedLayers.filter(l => l.zIndexMode === 'front').forEach(l => {
        if (l.img.complete && l.img.naturalWidth > 0) {
            cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
        }
    });

    const link = document.createElement('a');
    link.download = `${metadata.name.replace('.svga', '')}_frame_${currentFrame}.png`;
    link.href = compCanvas.toDataURL('image/png');
    link.click();
  };



  const handleExportStandardVideo = async () => {
    if (!svgaInstance || !playerRef.current) return;
    const canProceed = await checkAndDeductCoins();
    if (!canProceed) return;

    setIsExporting(true);
    setExportPhase('جاري تسجيل الفيديو (Frame-by-Frame)...');
    setShowRecordingModal(false);

    let audioContext: AudioContext | null = null;

    try {
        svgaInstance.pauseAnimation();
        const originalFrame = currentFrame;
        const totalFrames = metadata.frames || 0;
        const fps = metadata.fps || 30;
        
        // Ensure even dimensions
        const safeWidth = videoWidth % 2 === 0 ? videoWidth : videoWidth - 1;
        const safeHeight = videoHeight % 2 === 0 ? videoHeight : videoHeight - 1;

        // Composition Canvas
        const compCanvas = document.createElement('canvas');
        compCanvas.width = safeWidth;
        compCanvas.height = safeHeight;
        const cCtx = compCanvas.getContext('2d', { willReadFrequently: true });
        if (!cCtx) throw new Error("Failed to create Composition context");

        // Helper to load image
        const loadImage = (src: string): Promise<HTMLImageElement> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = () => {
                    console.warn("Failed to load image for recording:", src);
                    resolve(img); // Resolve anyway to prevent hanging
                };
                img.src = src;
            });
        };

        // Preload Assets
        setExportPhase('تحضير الأصول والخلفيات...');
        const loadedLayers = await Promise.all(customLayers.map(async l => {
            const img = await loadImage(l.url);
            return { ...l, img };
        }));

        let bgImg: HTMLImageElement | null = null;
        if (previewBg) bgImg = await loadImage(previewBg);
        
        let wmImg: HTMLImageElement | null = null;
        if (watermark) wmImg = await loadImage(watermark);

        // Audio Setup
        let audioEncoder: AudioEncoder | null = null;
        let audioTrack: any = undefined;
        let audioDataChunks: AudioData[] = [];

        if (audioFile || audioUrl) {
            try {
                let arrayBuffer: ArrayBuffer | null = null;
                if (audioFile) {
                    arrayBuffer = await audioFile.arrayBuffer();
                } else if (audioUrl) {
                    const resp = await fetch(audioUrl);
                    arrayBuffer = await resp.arrayBuffer();
                }

                if (arrayBuffer && arrayBuffer.byteLength > 0) {
                    const offlineCtx = new OfflineAudioContext(2, 48000 * 1, 48000);
                    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
                    
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
                }
            } catch (e) {
                console.warn("Audio setup failed", e);
            }
        }

        const muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: {
                codec: 'V_VP9',
                width: safeWidth,
                height: safeHeight,
                frameRate: fps,
                alpha: false
            },
            audio: audioTrack
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => console.error(e)
        });

        videoEncoder.configure({
            codec: 'vp09.00.10.08',
            width: safeWidth,
            height: safeHeight,
            bitrate: 20000000, // 20 Mbps for ultra high quality
            alpha: 'discard'
        });

        if (audioTrack) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: (e) => console.error(e)
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

        setExportPhase('جاري تسجيل الإطارات (Rendering)...');

        for (let i = 0; i < totalFrames; i++) {
            // Use false to prevent auto-play, ensuring we stay on the specific frame
            svgaInstance.stepToFrame(i, false);
            
            // Increased delay to 100ms to ensure frame is fully rendered and prevent stuttering/cutting
            // This is critical for ensuring the SVGA canvas is fully updated before capture
            await new Promise(r => setTimeout(r, 100));

            // Render Composition
            cCtx.clearRect(0, 0, safeWidth, safeHeight);

            // 1. Background
            if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                const bgW = (safeWidth * bgScale) / 100;
                const bgH = bgW * (bgImg.height / bgImg.width);
                const bgX = (safeWidth - bgW) * (bgPos.x / 100);
                const bgY = (safeHeight - bgH) * (bgPos.y / 100);
                cCtx.drawImage(bgImg, bgX, bgY, bgW, bgH);
            }

            // 2. Back Layers
            loadedLayers.filter(l => l.zIndexMode === 'back').forEach(l => {
                if (l.img.complete && l.img.naturalWidth > 0) {
                    cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
                }
            });

            // 3. SVGA
            const currentSourceCanvas = playerRef.current?.querySelector('canvas');
            if (currentSourceCanvas) {
                const cx = safeWidth / 2;
                const cy = safeHeight / 2;
                cCtx.save();
                cCtx.translate(cx + svgaPos.x, cy + svgaPos.y);
                cCtx.scale(svgaScale, svgaScale);
                cCtx.translate(-cx, -cy);
                cCtx.drawImage(currentSourceCanvas, 0, 0);
                cCtx.restore();
            }

            // 4. Watermark
            if (wmImg && wmImg.complete && wmImg.naturalWidth > 0) {
                const wmW = safeWidth * wmScale;
                const wmH = wmW * (wmImg.height / wmImg.width);
                const wmX = (safeWidth - wmW) / 2 + wmPos.x;
                const wmY = (safeHeight - wmH) / 2 + wmPos.y;
                cCtx.globalAlpha = 0.7;
                cCtx.drawImage(wmImg, wmX, wmY, wmW, wmH);
                cCtx.globalAlpha = 1.0;
            }

            // 5. Front Layers
            loadedLayers.filter(l => l.zIndexMode === 'front').forEach(l => {
                if (l.img.complete && l.img.naturalWidth > 0) {
                    cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
                }
            });

            const bitmap = await createImageBitmap(compCanvas);
            const frame = new VideoFrame(bitmap, { timestamp: (i * 1000000) / fps });
            videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();
            bitmap.close();

            setProgress(Math.floor(((i + 1) / totalFrames) * 100));
        }

        // Add one last frame to prevent abrupt cut
        if (totalFrames > 0) {
             const bitmap = await createImageBitmap(compCanvas);
             const frame = new VideoFrame(bitmap, { timestamp: (totalFrames * 1000000) / fps });
             videoEncoder.encode(frame, { keyFrame: false });
             frame.close();
             bitmap.close();
        }

        await videoEncoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${metadata.name.replace('.svga', '')}_Recording.webm`;
        a.click();

        svgaInstance.stepToFrame(originalFrame, true);
        if (isPlaying) svgaInstance.startAnimation();

    } catch (e) {
        console.error(e);
        alert("فشل التسجيل: " + (e as any).message);
    } finally {
        setIsExporting(false);
        setProgress(0);
    }
  };

  const [showRecordingModal, setShowRecordingModal] = useState(false);

  const handleMainExport = async () => {
    if (selectedFormat === 'AE Project') await handleExportAEProject();
    else if (selectedFormat === 'Image Sequence') await handleExportImageSequence();
    else if (selectedFormat === 'GIF (Animation)') await handleExportGIF();
    else if (selectedFormat === 'APNG (Animation)') await handleExportAPNG();
    else if (selectedFormat === 'WebM (Video)') await handleExportWebP();
    else if (selectedFormat === 'VAP (MP4)') {
        const canProceed = await checkAndDeductCoins();
        if (!canProceed) return;

        setIsExporting(true);
        setExportPhase('جاري إنشاء فيديو VAP (Alpha+RGB)...');

        let audioContext: AudioContext | null = null;

        try {
            if (!svgaInstance || !playerRef.current) throw new Error("Player not ready");
            
            svgaInstance.pauseAnimation();
            const originalFrame = currentFrame;
            const totalFrames = svgaInstance.videoItem?.frames || metadata.frames || 0;
            const fps = metadata.fps || 30;
            
            // Ensure even dimensions for video encoding
            const safeWidth = videoWidth % 2 === 0 ? videoWidth : videoWidth - 1;
            const safeHeight = videoHeight % 2 === 0 ? videoHeight : videoHeight - 1;
            
            // VAP Canvas (2x Width)
            const vapWidth = safeWidth * 2;
            const vapHeight = safeHeight;
            
            const vapCanvas = document.createElement('canvas');
            vapCanvas.width = vapWidth;
            vapCanvas.height = vapHeight;
            const vCtx = vapCanvas.getContext('2d', { willReadFrequently: true });
            
            if (!vCtx) throw new Error("Failed to create VAP context");

            // Composition Canvas (for stacking layers)
            const compCanvas = document.createElement('canvas');
            compCanvas.width = safeWidth;
            compCanvas.height = safeHeight;
            const cCtx = compCanvas.getContext('2d', { willReadFrequently: true });
            if (!cCtx) throw new Error("Failed to create Composition context");

            // Helper to load image with crossOrigin
            const loadImage = (src: string): Promise<HTMLImageElement> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => resolve(img);
                    img.onerror = () => {
                         console.warn(`Failed to load image: ${src}`);
                         resolve(img); 
                    };
                    img.src = src;
                });
            };

            // Preload Assets
            const loadedLayers = await Promise.all(customLayers.map(async l => {
                const img = await loadImage(l.url);
                return { ...l, img };
            }));

            let bgImg: HTMLImageElement | null = null;
            if (previewBg) {
                bgImg = await loadImage(previewBg);
            }
            
            let wmImg: HTMLImageElement | null = null;
            if (watermark) {
                wmImg = await loadImage(watermark);
            }

            // Audio Setup
            let audioEncoder: AudioEncoder | null = null;
            let audioTrack: any = undefined;
            let audioDataChunks: AudioData[] = [];

            // Try to process audio first
            if (audioFile || audioUrl) {
                try {
                    let arrayBuffer: ArrayBuffer | null = null;
                    if (audioFile) {
                        arrayBuffer = await audioFile.arrayBuffer();
                    } else if (audioUrl) {
                        const resp = await fetch(audioUrl);
                        arrayBuffer = await resp.arrayBuffer();
                    }

                    if (arrayBuffer && arrayBuffer.byteLength > 0) {
                        // Use OfflineAudioContext for more stable decoding
                        const offlineCtx = new OfflineAudioContext(2, 48000 * 1, 48000); // Dummy length, will be ignored by decodeAudioData
                        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
                        
                        // If successful, we have audio. Prepare for encoding.
                        audioTrack = {
                            codec: 'A_OPUS',
                            numberOfChannels: 2,
                            sampleRate: 48000
                        };

                        // Prepare Audio Data Chunks
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

                        const chunkSize = sampleRate; // 1 second chunks
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
                    }
                } catch (audioError) {
                    console.warn("Audio processing failed, continuing without audio:", audioError);
                    audioTrack = undefined;
                    audioDataChunks = [];
                }
            }

            const muxer = new WebMMuxer.Muxer({
                target: new WebMMuxer.ArrayBufferTarget(),
                video: {
                    codec: 'V_VP9',
                    width: vapWidth,
                    height: vapHeight,
                    frameRate: fps,
                    alpha: false // VAP is opaque side-by-side
                },
                audio: audioTrack
            });

            const videoEncoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (e) => console.error(e)
            });

            videoEncoder.configure({
                codec: 'vp09.00.10.08',
                width: vapWidth,
                height: vapHeight,
                bitrate: 8000000, // Increased bitrate for better quality
                alpha: 'discard' // We are encoding opaque frame
            });

            // Configure Audio Encoder if we have audio track
            if (audioTrack) {
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

                // Encode all prepared chunks
                for (const chunk of audioDataChunks) {
                    audioEncoder.encode(chunk);
                    chunk.close();
                }
                await audioEncoder.flush();
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = safeWidth;
            tempCanvas.height = safeHeight;
            const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

            for (let i = 0; i < totalFrames; i++) {
                svgaInstance.stepToFrame(i, true);
                await new Promise(r => setTimeout(r, 20)); // Increased wait time slightly

                if (videoEncoder.encodeQueueSize > 15) {
                    await videoEncoder.flush();
                }

                // --- COMPOSITION START ---
                cCtx.clearRect(0, 0, safeWidth, safeHeight);

                // 1. Background
                if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                    const bgW = (safeWidth * bgScale) / 100;
                    const bgH = bgW * (bgImg.height / bgImg.width);
                    const bgX = (safeWidth - bgW) * (bgPos.x / 100);
                    const bgY = (safeHeight - bgH) * (bgPos.y / 100);
                    cCtx.drawImage(bgImg, bgX, bgY, bgW, bgH);
                }

                // 2. Back Layers
                loadedLayers.filter(l => l.zIndexMode === 'back').forEach(l => {
                    if (l.img.complete && l.img.naturalWidth > 0) {
                        cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
                    }
                });

                // 3. SVGA Frame
                const currentSourceCanvas = playerRef.current?.querySelector('canvas');
                if (currentSourceCanvas) {
                    const cx = safeWidth / 2;
                    const cy = safeHeight / 2;
                    cCtx.save();
                    cCtx.translate(cx + svgaPos.x, cy + svgaPos.y);
                    cCtx.scale(svgaScale, svgaScale);
                    cCtx.translate(-cx, -cy);
                    cCtx.drawImage(currentSourceCanvas, 0, 0);
                    cCtx.restore();
                }

                // 4. Watermark
                if (wmImg && wmImg.complete && wmImg.naturalWidth > 0) {
                    const wmW = safeWidth * wmScale;
                    const wmH = wmW * (wmImg.height / wmImg.width);
                    const wmX = (safeWidth - wmW) / 2 + wmPos.x;
                    const wmY = (safeHeight - wmH) / 2 + wmPos.y;
                    cCtx.globalAlpha = 0.7;
                    cCtx.drawImage(wmImg, wmX, wmY, wmW, wmH);
                    cCtx.globalAlpha = 1.0;
                }

                // 5. Front Layers
                loadedLayers.filter(l => l.zIndexMode === 'front').forEach(l => {
                    if (l.img.complete && l.img.naturalWidth > 0) {
                        cCtx.drawImage(l.img, l.x, l.y, l.width * l.scale, l.height * l.scale);
                    }
                });
                // --- COMPOSITION END ---

                // Prepare VAP Frame
                // IMPORTANT: Fill with black first to ensure no transparency issues
                vCtx.fillStyle = '#000000';
                vCtx.fillRect(0, 0, vapWidth, vapHeight);

                // Draw RGB (Right Side)
                vCtx.drawImage(compCanvas, safeWidth, 0);

                // Draw Alpha (Left Side)
                if (tCtx) {
                    tCtx.clearRect(0, 0, safeWidth, safeHeight);
                    tCtx.drawImage(compCanvas, 0, 0);
                    
                    // Apply Edge Fade to Alpha Channel
                    applyTransparencyEffects(tCtx, safeWidth, safeHeight);

                    const imageData = tCtx.getImageData(0, 0, safeWidth, safeHeight);
                    const data = imageData.data;
                    
                    for (let j = 0; j < data.length; j += 4) {
                        const alpha = data[j + 3];
                        data[j] = alpha;     // R
                        data[j + 1] = alpha; // G
                        data[j + 2] = alpha; // B
                        data[j + 3] = 255;   // Full Opaque
                    }
                    tCtx.putImageData(imageData, 0, 0);
                    vCtx.drawImage(tempCanvas, 0, 0);
                }
                
                const bitmap = await createImageBitmap(vapCanvas);
                const frame = new VideoFrame(bitmap, { timestamp: (i * 1000000) / fps });
                videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
                frame.close();
                bitmap.close();

                setProgress(Math.floor(((i + 1) / totalFrames) * 100));
            }

            await videoEncoder.flush();
            muxer.finalize();

            const buffer = muxer.target.buffer;
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            setExportedVapUrl(url);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${metadata.name.replace('.svga', '')}_VAP.mp4`;
            a.click();
            
            svgaInstance.stepToFrame(originalFrame, true);
            if (isPlaying) svgaInstance.startAnimation();
            setIsExporting(false);
            setProgress(0);

        } catch (e) {
            console.error(e);
            alert("فشل تصدير VAP: " + (e as any).message);
            setIsExporting(false);
        } finally {
            if (audioContext) {
                await audioContext.close();
            }
        }
    }
    else if (selectedFormat === 'WebP (Animated)') {
        await handleExportWebP();
    }
    else if (selectedFormat === 'SVGA 2.0' && typeof protobuf !== 'undefined') {
        const canProceed = await checkAndDeductCoins();
        if (!canProceed) return;

        const isEdgeFadeActive = fadeConfig.top > 0 || fadeConfig.bottom > 0 || fadeConfig.left > 0 || fadeConfig.right > 0;

        setIsExporting(true); 
        setExportPhase(isEdgeFadeActive ? 'جاري تطبيق الشفافية على الصور (Baking)...' : 'جاري ضغط الصور وإعادة بناء ملف SVGA...');
        
        try {
            const root = protobuf.parse(`syntax="proto3";package com.opensource.svga;message MovieParams{float viewBoxWidth=1;float viewBoxHeight=2;int32 fps=3;int32 frames=4;}message Transform{float a=1;float b=2;float c=3;float d=4;float tx=5;float ty=6;}message Layout{float x=1;float y=2;float width=3;float height=4;}message ShapeEntity{int32 type=1;map<string,float> args=2;map<string,string> styles=3;Transform transform=4;}message FrameEntity{float alpha=1;Layout layout=2;Transform transform=3;string clipPath=4;repeated ShapeEntity shapes=5;string blendMode=6;}message AudioEntity{string audioKey=1;int32 startFrame=2;int32 endFrame=3;int32 startTime=4;int32 totalTime=5;}message MovieEntity{string version=1;MovieParams params=2;map<string, bytes> images=3;repeated SpriteEntity sprites=4;repeated AudioEntity audios=5;}message SpriteEntity{string imageKey=1;repeated FrameEntity frames=2;string matteKey=3;}`).root;
            const MovieEntity = root.lookupType("com.opensource.svga.MovieEntity");
            
            const imagesData: Record<string, Uint8Array> = {};
            const audioList: any[] = [...(metadata.videoItem.audios || [])];
            
            let finalSprites = (metadata.videoItem.sprites || []).filter((s: any) => !deletedKeys.has(s.imageKey)).map((s: any) => {
                return JSON.parse(JSON.stringify(s));
            });

            // ---------------------------------------------------------
            // STANDARD ASSET PROCESSING (With Baked Transparency)
            // ---------------------------------------------------------
            // Collect all unique image keys from sprites AND layerImages
            const allImageKeys = new Set<string>();
            (metadata.videoItem.sprites || []).forEach((s: any) => allImageKeys.add(s.imageKey));
            Object.keys(layerImages).forEach(k => allImageKeys.add(k));

            const keys = Array.from(allImageKeys);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (deletedKeys.has(key)) continue;
                if (imagesData[key]) continue; 

                let finalBase64 = "";
                
                // 1. Try to get processed asset (replaced)
                if (layerImages[key]) {
                    finalBase64 = await getProcessedAsset(key);
                } 
                // 2. Or get original asset
                else if (metadata.videoItem.images[key]) {
                    // Original asset (could be base64 or binary)
                    // We need it as base64 for image loading
                    const imgData = metadata.videoItem.images[key];
                    if (typeof imgData === 'string') {
                         finalBase64 = imgData.startsWith('data:') ? imgData : `data:image/png;base64,${imgData}`;
                    } else if (imgData instanceof Uint8Array) {
                         // Convert Uint8Array to base64
                         let binary = '';
                         const len = imgData.byteLength;
                         for (let k = 0; k < len; k++) {
                             binary += String.fromCharCode(imgData[k]);
                         }
                         finalBase64 = `data:image/png;base64,${btoa(binary)}`;
                    }
                }

                if (!finalBase64) continue;
                
                // If we need to resize OR apply edge fade, we must use a canvas
                if (exportScale < 0.99 || isEdgeFadeActive) {
                    const img = new Image();
                    img.src = finalBase64;
                    await new Promise(r => img.onload = r);
                    const canvas = document.createElement('canvas');
                    // If resizing, use scaled dimensions. If only fading, use original.
                    const targetScale = exportScale < 0.99 ? exportScale : 1.0;
                    canvas.width = Math.floor(img.width * targetScale);
                    canvas.height = Math.floor(img.height * targetScale);
                    
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        
                        // Apply Edge Fade if active
                        // Note: This bakes the fade into the image itself. 
                        // Ideal for full-screen video frames. 
                        // For moving sprites, this will fade their edges relative to the sprite, not the screen.
                        if (isEdgeFadeActive) {
                            applyTransparencyEffects(ctx, canvas.width, canvas.height);
                        }

                        finalBase64 = canvas.toDataURL('image/png');
                    }
                }

                const binaryString = atob(finalBase64.split(',')[1]);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
                imagesData[key] = bytes;
                
                if (i % 10 === 0) {
                    setProgress(Math.floor((i / keys.length) * 100));
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            // Apply SVGA Global Transforms
            finalSprites.forEach((sprite: any) => {
                sprite.frames.forEach((frame: any) => {
                    if (frame.layout) {
                        const cx = videoWidth / 2;
                        const cy = videoHeight / 2;
                        frame.layout.x = (frame.layout.x - cx) * svgaScale + cx + svgaPos.x;
                        frame.layout.y = (frame.layout.y - cy) * svgaScale + cy + svgaPos.y;
                        frame.layout.width *= svgaScale;
                        frame.layout.height *= svgaScale;
                    }
                });
            });

            // ---------------------------------------------------------
            // COMMON: WATERMARK & CUSTOM LAYERS
            // ---------------------------------------------------------
            
            // 3. Custom Layers
            // Back Layers (Prepend to be behind)
            const backLayers = customLayers.filter(l => l.zIndexMode === 'back');
            // We need to insert them at the beginning of finalSprites, but AFTER the background if any?
            // SVGA rendering order: sprites appear in order. Last one is on top.
            // So 'back' layers should be at the START of the array.
            // 'front' layers should be at the END.
            
            for (const layer of backLayers) {
                const layerKey = layer.id;
                const binary = atob(layer.url.split(',')[1]);
                const bytes = new Uint8Array(binary.length);
                for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
                imagesData[layerKey] = bytes;

                const finalWidth = layer.width * layer.scale;
                const finalHeight = layer.height * layer.scale;
                const layerFrame = {
                    alpha: 1.0,
                    layout: { x: layer.x, y: layer.y, width: finalWidth, height: finalHeight },
                    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
                };
                finalSprites.unshift({ imageKey: layerKey, frames: Array(metadata.frames || 1).fill(layerFrame) });
            }

            // Front Layers (Append to be on top)
            const frontLayers = customLayers.filter(l => l.zIndexMode === 'front');
            for (const layer of frontLayers) {
                const layerKey = layer.id;
                const binary = atob(layer.url.split(',')[1]);
                const bytes = new Uint8Array(binary.length);
                for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
                imagesData[layerKey] = bytes;

                const finalWidth = layer.width * layer.scale;
                const finalHeight = layer.height * layer.scale;
                const layerFrame = {
                    alpha: 1.0,
                    layout: { x: layer.x, y: layer.y, width: finalWidth, height: finalHeight },
                    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
                };
                finalSprites.push({ imageKey: layerKey, frames: Array(metadata.frames || 1).fill(layerFrame) });
            }

            // 2. Watermark (Should be on TOP of everything)
            const wmKey = "quantum_wm_layer_fixed";
            if (watermark) {
                const binary = atob(watermark.split(',')[1]);
                const bytes = new Uint8Array(binary.length);
                for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
                imagesData[wmKey] = bytes;

                const wmSize = await getImageSize(watermark);
                const wmWidth = videoWidth * wmScale;
                const wmHeight = wmWidth * (wmSize.h / wmSize.w);
                const wmX = (videoWidth / 2) - (wmWidth / 2) + wmPos.x;
                const wmY = (videoHeight / 2) - (wmHeight / 2) + wmPos.y;
                
                const wmFrame = {
                    alpha: 1.0,
                    layout: { x: wmX || 0, y: wmY || 0, width: wmWidth, height: wmHeight },
                    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
                };
                finalSprites.push({
                    imageKey: wmKey,
                    frames: Array(metadata.frames || 1).fill(wmFrame)
                });
            }

            // ---------------------------------------------------------
            // AUDIO HANDLING
            // ---------------------------------------------------------
            if (audioUrl) {
                const audioKey = "quantum_audio_track";
                let bytes: Uint8Array | null = null;
                
                // If user uploaded a new audio file, use it
                if (audioFile) {
                    const arrayBuffer = await audioFile.arrayBuffer();
                    bytes = new Uint8Array(arrayBuffer);
                } 
                // If it's the original audio from SVGA/MP4 and hasn't been changed
                else if (audioUrl === originalAudioUrl) {
                     // If it's in the original imagesData (extracted from SVGA), we might need to find its key
                     // But here we are rebuilding. If originalAudioUrl is set, we might have extracted it.
                     // If we want to KEEP original audio without re-encoding, we should ensure it's in imagesData.
                     // However, for MP4 uploads, audioUrl is a blob URL.
                     try {
                        const response = await fetch(audioUrl);
                        const arrayBuffer = await response.arrayBuffer();
                        bytes = new Uint8Array(arrayBuffer);
                     } catch (e) { console.error("Failed to fetch audio blob", e); }
                }
                // If it's a new audio URL (e.g. from video)
                else {
                    try {
                        const response = await fetch(audioUrl);
                        const arrayBuffer = await response.arrayBuffer();
                        bytes = new Uint8Array(arrayBuffer);
                    } catch (e) { console.error("Failed to fetch audio", e); }
                }

                if (bytes) {
                    imagesData[audioKey] = bytes; 
                    // Remove existing audios if we are replacing
                    // Or append? Usually one audio track is preferred.
                    // Let's replace to be safe if we are "setting" audio.
                    // But if we want to preserve original audios and just ADD, we should check.
                    // For now, let's assume we replace if audioUrl is active.
                    
                    // Clear existing audios list if we are providing a main track
                    audioList.length = 0; 
                    audioList.push({
                        audioKey: audioKey,
                        startFrame: 0,
                        endFrame: metadata.frames || 0,
                        startTime: 0,
                        totalTime: Math.floor(((metadata.frames || 0) / (metadata.fps || 30)) * 1000)
                    });
                }
            }

            // ---------------------------------------------------------
            // CONSTRUCT PAYLOAD
            // ---------------------------------------------------------
            const payload = { 
                version: "2.0", 
                params: { 
                    viewBoxWidth: videoWidth, 
                    viewBoxHeight: videoHeight, 
                    fps: metadata.fps || 30, 
                    frames: metadata.frames || 0 
                }, 
                images: imagesData, 
                sprites: finalSprites,
                audios: audioList
            };

            const buffer = MovieEntity.encode(MovieEntity.create(payload)).finish();
            const compressedBuffer = pako.deflate(buffer);
            
            const link = document.createElement("a");
            link.href = URL.createObjectURL(new Blob([compressedBuffer]));
            link.download = `${metadata.name.replace('.svga','')}_Quantum_${Math.round(exportScale*100)}.svga`;
            link.click();
            setProgress(100);
        } catch (e) {
            console.error(e);
            alert("فشل التصدير: " + (e as any).message);
        } finally { 
            setTimeout(() => setIsExporting(false), 800); 
        }
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8 pb-32 animate-in fade-in slide-in-from-bottom-8 duration-1000 font-arabic select-none text-right" dir="rtl">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleReplaceImage} />
      <input type="file" ref={bgInputRef} className="hidden" accept="image/*" onChange={handleBgUpload} />
      <input type="file" ref={watermarkInputRef} className="hidden" accept="image/*" onChange={handleWatermarkUpload} />
      <input type="file" ref={layerInputRef} className="hidden" accept="image/*" onChange={handleAddLayer} />
      <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleAudioUpload} />
      <input type="file" ref={videoInputRef} className="hidden" accept="video/mp4" onChange={handleVideoUpload} />
      <audio ref={audioRef} src={audioUrl || undefined} loop />

      {isExporting && (
        <div className="fixed inset-0 z-[500] bg-slate-950/80 backdrop-blur-3xl flex items-center justify-center p-6">
           <div className="max-w-md w-full bg-slate-900 border border-white/10 p-10 rounded-[3rem] shadow-3xl text-center space-y-6">
              <div className="w-24 h-24 bg-sky-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-500/20">
                 <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h3 className="text-white font-black text-xl uppercase tracking-tighter">{exportPhase}</h3>
              <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                 <div className="h-full bg-sky-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between p-6 sm:p-10 rounded-[3rem] border border-white/5 gap-6 shadow-2xl bg-slate-900/40 backdrop-blur-3xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-l from-transparent via-sky-500/30 to-transparent"></div>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-center sm:text-right">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-[2rem] flex items-center justify-center text-white shadow-glow-sky text-3xl">
             <span className="drop-shadow-lg animate-pulse">⚛️</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight mb-1">{metadata.name}</h2>
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 sm:gap-4">
               <span className="px-3 py-1 bg-sky-500/10 text-sky-400 text-[10px] font-black rounded-lg border border-sky-500/20 uppercase tracking-[0.2em]">{videoWidth}X{videoHeight}</span>
               <span className="text-[10px] sm:text-[12px] text-slate-500 font-bold uppercase tracking-[0.3em]">{metadata.frames} إطارات</span>
            </div>
          </div>
        </div>
        <button onClick={onCancel} className="w-full sm:w-auto px-10 py-5 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-[2rem] border border-white/10 transition-all font-black uppercase text-[10px] tracking-widest active:scale-95">إلغاء المعالجة</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 sm:gap-8 overflow-visible">
        <div className="xl:col-span-7 flex flex-col gap-0 overflow-visible">
          <div className="relative flex items-center justify-center w-full overflow-hidden rounded-[3rem] border border-white/10 shadow-3xl bg-black/20" style={{ height: `${videoHeight * scale}px` }}>
              <div ref={containerRef} className="absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out origin-center pointer-events-none" style={{ transform: `scale(${scale})` }}>
                  <div className="relative overflow-hidden shadow-2xl bg-slate-950 pointer-events-auto" style={{ 
                      width: `${videoWidth}px`, 
                      height: `${videoHeight}px`, 
                      backgroundImage: previewBg ? `url(${previewBg})` : 'none', 
                      backgroundSize: `${bgScale}%`, 
                      backgroundRepeat: 'no-repeat', 
                      backgroundPosition: `${bgPos.x}% ${bgPos.y}%`, 
                      boxShadow: '0 0 100px rgba(0,0,0,0.5), inset 0 0 50px rgba(0,0,0,0.5)', 
                      border: previewBg ? 'none' : '2px solid rgba(255,255,255,0.05)',
                      maskImage: (fadeConfig.top > 0 || fadeConfig.bottom > 0 || fadeConfig.left > 0 || fadeConfig.right > 0) ? `
                        linear-gradient(to right, transparent, black ${fadeConfig.left}%, black ${100-fadeConfig.right}%, transparent), 
                        linear-gradient(to bottom, transparent, black ${fadeConfig.top}%, black ${100-fadeConfig.bottom}%, transparent)
                      ` : 'none',
                      maskComposite: 'intersect'
                  }}>
                      {/* Back Layers */}
                      {customLayers.filter(l => l.zIndexMode === 'back').map(layer => (
                        <div 
                            key={layer.id}
                            className="absolute z-[5] pointer-events-none transition-transform duration-200"
                            style={{ 
                                left: 0, 
                                top: 0, 
                                transform: `translate(${layer.x}px, ${layer.y}px)`,
                                width: layer.width * layer.scale,
                                height: layer.height * layer.scale
                            }}
                        >
                            <img 
                                src={layer.url} 
                                className={`w-full h-full pointer-events-auto cursor-pointer ${selectedLayerId === layer.id ? 'ring-2 ring-sky-500 shadow-glow-sky' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedLayerId(layer.id); setActiveSideTab('transforms'); }}
                            />
                        </div>
                      ))}

                      <div className="w-full h-full relative z-10 flex items-center justify-center transition-transform duration-300" style={{ transform: `translate(${svgaPos.x}px, ${svgaPos.y}px) scale(${svgaScale})` }}>
                         <div ref={playerRef} id="svga-player-container" className="w-full h-full relative flex items-center justify-center overflow-visible"></div>
                      </div>
                      {watermark && (
                        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-0 transition-transform duration-200" style={{ transform: `translate(${wmPos.x}px, ${wmPos.y}px)` }}>
                           <img src={watermark} className="object-contain filter drop-shadow-2xl opacity-70" style={{ width: `${wmScale * 100}%` }} alt="Watermark" />
                        </div>
                      )}
                      {/* Front Layers */}
                      {customLayers.filter(l => l.zIndexMode === 'front').map(layer => (
                        <div 
                            key={layer.id}
                            className="absolute z-25 pointer-events-none transition-transform duration-200"
                            style={{ 
                                left: 0, 
                                top: 0, 
                                transform: `translate(${layer.x}px, ${layer.y}px)`,
                                width: layer.width * layer.scale,
                                height: layer.height * layer.scale
                            }}
                        >
                            <img 
                                src={layer.url} 
                                className={`w-full h-full pointer-events-auto cursor-pointer ${selectedLayerId === layer.id ? 'ring-2 ring-sky-500 shadow-glow-sky' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedLayerId(layer.id); setActiveSideTab('transforms'); }}
                            />
                        </div>
                      ))}
                  </div>
              </div>
          </div>

          <div className="mt-4 w-full bg-slate-950/60 backdrop-blur-3xl p-6 sm:p-8 rounded-[2.5rem] border border-white/5 flex flex-col sm:flex-row items-center gap-6 sm:gap-8 shadow-2xl relative z-20">
               <button onClick={handlePlayToggle} className="w-16 h-16 bg-sky-500 hover:bg-sky-400 text-white rounded-2xl flex items-center justify-center shadow-glow-sky transition-all active:scale-90">
                 {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z"/></svg> : <svg className="w-8 h-8 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M4.5 3.5l11 6.5-11 6.5z"/></svg>}
               </button>
               <button onClick={handleDownloadFrame} className="w-16 h-16 bg-white/5 hover:bg-white/10 text-white rounded-2xl flex items-center justify-center border border-white/10 transition-all active:scale-90" title="تنزيل الإطار الحالي">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               </button>
               <div className="flex-1 w-full flex flex-col gap-3">
                  <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                       <span className="text-white font-black text-xs px-3 py-1 bg-white/5 rounded-lg border border-white/5">{currentFrame} / {metadata.frames}</span>
                       {audioUrl && (
                         <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 animate-pulse">
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                           صوت نشط
                         </span>
                       )}
                    </div>
                    <span className="text-slate-600 text-[9px] font-black uppercase tracking-widest">إطار المشهد</span>
                  </div>
                  <div className="relative h-2 flex items-center">
                    <div className="absolute inset-0 h-1 bg-white/5 rounded-full overflow-hidden">
                       <div className="h-full bg-sky-500" style={{ width: `${(currentFrame / (metadata.frames || 1)) * 100}%` }}></div>
                    </div>
                    <input type="range" min="0" max={metadata.frames || 1} value={currentFrame} onChange={(e) => { const f = parseInt(e.target.value); svgaInstance?.stepToFrame(f, false); setCurrentFrame(f); }} className="absolute inset-0 w-full h-full appearance-none bg-transparent accent-sky-500 cursor-pointer z-10" />
                  </div>
               </div>
          </div>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-6 h-auto xl:h-[800px]">
          <div className="flex bg-slate-950/80 p-1 rounded-3xl border border-white/5">
              <button onClick={() => setActiveSideTab('layers')} className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase transition-all ${activeSideTab === 'layers' ? 'bg-sky-500 text-white shadow-glow-sky' : 'text-slate-500'}`}>الطبقات</button>
              <button onClick={() => setActiveSideTab('transforms')} className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase transition-all ${activeSideTab === 'transforms' ? 'bg-sky-500 text-white shadow-glow-sky' : 'text-slate-500'}`}>التحويلات</button>
              <button onClick={() => setActiveSideTab('bg')} className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase transition-all ${activeSideTab === 'bg' ? 'bg-sky-500 text-white shadow-glow-sky' : 'text-slate-500'}`}>الخلفية</button>
              <button onClick={() => setActiveSideTab('optimize')} className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase transition-all ${activeSideTab === 'optimize' ? 'bg-emerald-500 text-white shadow-glow-emerald' : 'text-slate-500'}`}>ضغط الحجم</button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/80 rounded-[3rem] p-6 border border-white/5 shadow-3xl">
              {activeSideTab === 'layers' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-white font-black text-xl uppercase">إدارة الطبقات Quantum</h3>
                        <div className="flex gap-2">
                            {selectedKeys.size > 0 && (
                                <button onClick={() => {
                                    const newDeleted = new Set(deletedKeys);
                                    selectedKeys.forEach(k => newDeleted.add(k));
                                    setDeletedKeys(newDeleted);
                                    setSelectedKeys(new Set());
                                }} className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase shadow-glow-red">حذف المحدد ({selectedKeys.size})</button>
                            )}
                            <button onClick={() => layerInputRef.current?.click()} className="px-4 py-2 bg-sky-500 text-white rounded-xl text-[10px] font-black uppercase shadow-glow-sky">+ إضافة طبقة</button>
                        </div>
                    </div>
                    
                    {customLayers.length > 0 && (
                        <div className="mb-6 space-y-3 pb-6 border-b border-white/5">
                            <h4 className="text-sky-400 font-black text-xs uppercase tracking-widest mb-3">طبقات مضافة ({customLayers.length})</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {[...customLayers].reverse().map(layer => (
                                    <div key={layer.id} onClick={() => { setSelectedLayerId(layer.id); setActiveSideTab('transforms'); }} className={`group bg-slate-900/30 rounded-[2rem] border p-4 transition-all cursor-pointer ${selectedLayerId === layer.id ? 'border-sky-500 bg-sky-500/10' : 'border-white/[0.03]'}`}>
                                        <div className="aspect-square rounded-2xl bg-black/40 flex items-center justify-center relative overflow-hidden mb-2">
                                            <img src={layer.url} className="max-w-[80%] max-h-[80%] object-contain" />
                                        </div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[8px] text-white font-black truncate max-w-[80px]">{layer.name}</span>
                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveLayer(layer.id); }} className="text-red-500 hover:text-red-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                            </button>
                                        </div>
                                        <div className="flex gap-1 justify-between">
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveLayer(layer.id, 'down'); }} className="px-2 py-1 bg-white/5 rounded text-[8px] text-slate-400 hover:text-white">⬇️</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleUpdateLayer(layer.id, { zIndexMode: layer.zIndexMode === 'front' ? 'back' : 'front' }); }} className={`px-2 py-1 rounded text-[8px] font-black uppercase ${layer.zIndexMode === 'front' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-700 text-slate-400'}`}>{layer.zIndexMode === 'front' ? 'أمام' : 'خلف'}</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveLayer(layer.id, 'up'); }} className="px-2 py-1 bg-white/5 rounded text-[8px] text-slate-400 hover:text-white">⬆️</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {filteredKeys.map(key => (
                            <div 
                                key={key} 
                                onClick={() => {
                                    const newSelected = new Set(selectedKeys);
                                    if (newSelected.has(key)) newSelected.delete(key);
                                    else newSelected.add(key);
                                    setSelectedKeys(newSelected);
                                }}
                                className={`group bg-slate-900/30 rounded-[2rem] border p-4 transition-all duration-300 relative cursor-pointer ${selectedKeys.has(key) ? 'border-sky-500 bg-sky-500/10' : deletedKeys.has(key) ? 'border-red-500/50 grayscale opacity-40' : 'border-white/[0.03]'}`}
                            >
                                <div className="aspect-square rounded-2xl bg-black/40 flex items-center justify-center relative overflow-hidden">
                                   {layerImages[key] && <img src={layerImages[key]} className="max-w-[70%] max-h-[70%] object-contain" style={{ filter: assetColors[key] ? `drop-shadow(0 0 2px ${assetColors[key]})` : 'none' }} />}
                                   <div className="absolute top-2 right-2 w-5 h-5 rounded-full border border-white/20 flex items-center justify-center bg-black/40">
                                      {selectedKeys.has(key) && <div className="w-3 h-3 bg-sky-500 rounded-full"></div>}
                                   </div>
                                   <div className="absolute inset-0 bg-slate-950/90 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 backdrop-blur-md px-2" onClick={(e) => e.stopPropagation()}>
                                      {!deletedKeys.has(key) && (
                                          <div className="flex flex-col gap-2 w-full">
                                            <div className="flex gap-2 justify-center">
                                                <button onClick={() => { setReplacingAssetKey(key); fileInputRef.current?.click(); }} className="w-8 h-8 bg-sky-500 text-white rounded-lg flex items-center justify-center">✏️</button>
                                                <button onClick={() => handleDownloadLayer(key)} className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center">⬇️</button>
                                                <div className="relative w-8 h-8 bg-white/10 rounded-lg overflow-hidden border border-white/20">
                                                  <input type="color" value={assetColors[key] || "#ffffff"} onChange={(e) => handleColorChange(key, e.target.value)} className="absolute inset-[-50%] w-[200%] h-[200%] cursor-pointer bg-transparent border-none" />
                                                </div>
                                            </div>
                                            <button onClick={() => handleBakeLayer(key)} className="w-full py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-[8px] font-black uppercase hover:bg-indigo-500/30">تحويل متسلسل (Bake)</button>
                                            <button onClick={() => handleOpenFadeModal(key)} className="w-full py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-[8px] font-black uppercase hover:bg-purple-500/30">تلاشي الحواف (Fade)</button>
                                          </div>
                                      )}
                                      <button onClick={() => handleDeleteAsset(key)} className={`w-full py-1.5 ${deletedKeys.has(key) ? 'bg-emerald-500' : 'bg-red-500'} text-white rounded-lg text-[8px] font-black uppercase`}>{deletedKeys.has(key) ? 'استعادة' : 'حذف'}</button>
                                   </div>
                                </div>
                                <span className="mt-2 text-[8px] text-slate-500 font-black block text-center uppercase truncate">{key}</span>
                            </div>
                        ))}
                    </div>
                </div>
              )}

              {activeSideTab === 'transforms' && (
                <div className="space-y-10 animate-in slide-in-from-right-4 duration-300">
                    {selectedLayerId && customLayers.find(l => l.id === selectedLayerId) && (
                        <div className="space-y-6 pb-6 border-b border-white/5">
                            <div className="flex justify-between items-center">
                                <h4 className="text-white font-black text-xs uppercase tracking-widest text-sky-400">تحويلات الطبقة المحددة</h4>
                                <button onClick={() => setSelectedLayerId(null)} className="text-[9px] text-slate-500 hover:text-white">إلغاء التحديد</button>
                            </div>
                            <div className="space-y-4">
                               {(() => {
                                   const l = customLayers.find(l => l.id === selectedLayerId)!;
                                   return (
                                       <>
                                    <TransformControl label="الموضع الأفقي (X)" value={l.x} min={-videoWidth} max={videoWidth} onChange={v => handleUpdateLayer(l.id, { x: v })} />
                                           <TransformControl label="الموضع الرأسي (Y)" value={l.y} min={-videoHeight} max={videoHeight} onChange={v => handleUpdateLayer(l.id, { y: v })} />
                                           <TransformControl label="العرض (Width)" value={l.width} min={1} max={videoWidth * 2} onChange={v => handleUpdateLayer(l.id, { width: v })} />
                                           <TransformControl label="الارتفاع (Height)" value={l.height} min={1} max={videoHeight * 2} onChange={v => handleUpdateLayer(l.id, { height: v })} />
                                           <TransformControl label="مقياس الحجم (Scale)" value={l.scale} min={0.1} max={3} step={0.01} onChange={v => handleUpdateLayer(l.id, { scale: v })} />
                                       </>
                                   );
                               })()}
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        <h4 className="text-white font-black text-xs uppercase tracking-widest text-sky-400">تحويلات الهدية (SVGA)</h4>
                        <div className="space-y-4">
                           <TransformControl label="الموضع الأفقي (X)" value={svgaPos.x} min={-500} max={500} onChange={v => setSvgaPos(p => ({ ...p, x: v }))} />
                           <TransformControl label="الموضع الرأسي (Y)" value={svgaPos.y} min={-800} max={800} onChange={v => setSvgaPos(p => ({ ...p, y: v }))} />
                           <TransformControl label="مقياس الحجم" value={svgaScale} min={0.1} max={3} step={0.01} onChange={v => setSvgaScale(v)} />
                        </div>
                    </div>

                    <div className="space-y-6 pt-6 border-t border-white/5">
                        <h4 className="text-white font-black text-xs uppercase tracking-widest text-indigo-400">تحويلات العلامة المائية</h4>
                        <div className="space-y-4">
                           <TransformControl label="الموضع الأفقي (X)" value={wmPos.x} min={-500} max={500} onChange={v => setWmPos(p => ({ ...p, x: v }))} />
                           <TransformControl label="الموضع الرأسي (Y)" value={wmPos.y} min={-800} max={800} onChange={v => setWmPos(p => ({ ...p, y: v }))} />
                           <TransformControl label="الحجم" value={wmScale} min={0.05} max={1} step={0.01} onChange={v => setWmScale(v)} />
                        </div>
                    </div>

                    <div className="space-y-6 pt-6 border-t border-white/5">
                        <h4 className="text-white font-black text-xs uppercase tracking-widest text-emerald-400">تحويلات الخلفية</h4>
                        <div className="space-y-4">
                           <TransformControl label="تكبير الخلفية" value={bgScale} min={100} max={300} onChange={v => setBgScale(v)} />
                           <TransformControl label="الموضع X" value={bgPos.x} min={0} max={100} onChange={v => setBgPos(p => ({ ...p, x: v }))} />
                           <TransformControl label="الموضع Y" value={bgPos.y} min={0} max={100} onChange={v => setBgPos(p => ({ ...p, y: v }))} />
                        </div>
                    </div>
                </div>
              )}

              {activeSideTab === 'bg' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="grid grid-cols-2 gap-4">
                       <button onClick={() => bgInputRef.current?.click()} className="py-4 bg-white/5 border border-white/5 rounded-2xl text-[10px] text-white font-black uppercase">رفع خلفية</button>
                       <button onClick={() => watermarkInputRef.current?.click()} className="py-4 bg-white/5 border border-white/5 rounded-2xl text-[10px] text-white font-black uppercase">رفع علامة</button>
                       <button onClick={() => audioInputRef.current?.click()} className={`py-4 border border-white/5 rounded-2xl text-[10px] font-black uppercase ${audioUrl ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-white'}`}>{audioUrl ? 'تغيير الصوت' : 'رفع صوت'}</button>
                       <div className="flex gap-2">
                           <button onClick={() => { setSelectedFormat('VAP (MP4)'); handleMainExport(); }} className="flex-1 py-4 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-2xl text-[10px] font-black uppercase">تصدير VAP (flutter_vap_plus)</button>
                           <button onClick={() => setShowVapHelp(true)} className="w-12 flex items-center justify-center bg-white/5 border border-white/5 rounded-2xl text-white hover:bg-white/10">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                           </button>
                       </div>
                       <button onClick={() => videoInputRef.current?.click()} className="py-4 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-2xl text-[10px] font-black uppercase">تحويل MP4</button>
                       <button onClick={() => setShowRecordingModal(true)} className="col-span-2 py-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                          تسجيل فيديو (Screen Record)
                       </button>
                       {originalAudioUrl && (
                           <button onClick={() => { const link = document.createElement('a'); link.href = originalAudioUrl; link.download = `${metadata.name.replace('.svga', '')}_audio.mp3`; link.click(); }} className="py-4 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-2xl text-[10px] font-black uppercase">تنزيل الصوت الأصلي</button>
                       )}
                    </div>
                    
                    <div className="space-y-4 pt-4 border-t border-white/5">
                        <h4 className="text-white font-black text-xs uppercase tracking-widest text-emerald-400 mb-2">جودة التصدير (حجم الملف)</h4>
                        <TransformControl label={`الجودة: ${Math.round(exportScale * 100)}%`} value={exportScale * 100} min={10} max={100} step={10} onChange={v => setExportScale(v / 100)} />
                    </div>
                    
                    {audioUrl && (
                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <h4 className="text-white font-black text-xs uppercase tracking-widest text-emerald-400">التحكم بالصوت</h4>
                                <button onClick={() => setIsMuted(!isMuted)} className={`text-[10px] font-black uppercase ${isMuted ? 'text-red-500' : 'text-emerald-400'}`}>{isMuted ? 'تم كتم الصوت' : 'مفعل'}</button>
                            </div>
                            <TransformControl label="مستوى الصوت" value={volume * 100} min={0} max={100} step={1} onChange={v => setVolume(v / 100)} />
                        </div>
                    )}

                    {showRecordingModal && (
                        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in zoom-in duration-300">
                            <div className="bg-slate-900 border border-white/10 p-8 rounded-[3rem] w-full max-w-md shadow-3xl text-center space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-white font-black text-lg uppercase tracking-tighter">نافذة تسجيل الفيديو</h3>
                                    <button onClick={() => setShowRecordingModal(false)} className="text-slate-500 hover:text-white">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                
                                <div className="bg-black/40 rounded-2xl p-6 border border-white/5 space-y-4">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                        <span className="text-slate-500 text-[10px] font-black uppercase">الأبعاد</span>
                                        <span className="text-sky-400 font-mono font-bold">{videoWidth} x {videoHeight}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                        <span className="text-slate-500 text-[10px] font-black uppercase">المدة الزمنية</span>
                                        <span className="text-sky-400 font-mono font-bold">{((metadata.frames || 0) / (metadata.fps || 30)).toFixed(2)}s</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 text-[10px] font-black uppercase">عدد الإطارات</span>
                                        <span className="text-sky-400 font-mono font-bold">{metadata.frames} Frame</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-2xl">
                                    <p className="text-[10px] text-sky-300 font-bold">
                                        سيتم تسجيل الفيديو بدقة عالية (Frame-by-Frame) لضمان تطابق المدة الزمنية والجودة تماماً مع الملف الأصلي.
                                    </p>
                                </div>

                                <button 
                                    onClick={handleExportStandardVideo}
                                    className="w-full py-5 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-glow-red transition-all active:scale-95 flex items-center justify-center gap-3"
                                >
                                    <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
                                    بدء التسجيل الآن
                                </button>
                                <style>{`.shadow-glow-red { box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); }`}</style>
                            </div>
                        </div>
                    )}

                    {showVapHelp && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
                                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                                    <h3 className="text-white font-bold text-sm">توثيق flutter_vap_plus</h3>
                                    <button onClick={() => setShowVapHelp(false)} className="text-white/50 hover:text-white transition-colors">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                <div className="p-6 overflow-y-auto space-y-6 text-gray-300 text-sm leading-relaxed" dir="ltr">
                                    <div className="space-y-2">
                                        <h4 className="text-white font-bold text-base">Installation</h4>
                                        <div className="bg-black/50 rounded-lg p-3 font-mono text-xs border border-white/5">
                                            flutter_vap_plus: ^1.2.10
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-white font-bold text-base">Usage</h4>
                                        <div className="bg-black/50 rounded-lg p-3 font-mono text-xs border border-white/5 whitespace-pre overflow-x-auto">
{`import 'package:flutter_vap_plus/flutter_vap_plus.dart';

late VapController vapController;

IgnorePointer(
  // VapView can set the width and height through the outer package Container()
  child: VapView(
    fit: VapScaleFit.FIT_XY,
    onEvent: (event, args) {
      debugPrint('VapView event:\${event}');
    },
    onControllerCreated: (controller) {
      vapController = controller;
    },
  ),
),`}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-white font-bold text-base">Play Local Video</h4>
                                        <div className="bg-black/50 rounded-lg p-3 font-mono text-xs border border-white/5 whitespace-pre overflow-x-auto">
{`import 'package:flutter_vap_plus/flutter_vap_plus.dart';

Future<void> _playFile(String path) async {
  if (path == null) {
    return null;
  }
  await vapController.playPath(path);
}`}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-white font-bold text-base">Play Asset Video</h4>
                                        <div className="bg-black/50 rounded-lg p-3 font-mono text-xs border border-white/5 whitespace-pre overflow-x-auto">
{`Future<void> _playAsset(String asset) async {
  if (asset == null) {
    return null;
  }
  await vapController.playAsset(asset);
}`}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-white font-bold text-base">Merge Animation (Dynamic Replacement)</h4>
                                        <div className="bg-black/50 rounded-lg p-3 font-mono text-xs border border-white/5 whitespace-pre overflow-x-auto">
{`import 'package:flutter_vap_plus/flutter_vap_plus.dart';

Future<void> _playFile(String path) async {
  if (path == null) {
    return null;
  }
  await vapController.playPath(path, fetchResources: [
    FetchResourceModel(tag: 'tag', resource: '1.png'),
    FetchResourceModel(tag: 'text', resource: 'test user 1'),
  ]);
}`}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-white font-bold text-base">Control</h4>
                                        <div className="bg-black/50 rounded-lg p-3 font-mono text-xs border border-white/5">
                                            VapController.stop()
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                                    <button 
                                        onClick={() => setShowVapHelp(false)}
                                        className="px-6 py-2 bg-white/10 text-white rounded-lg text-sm font-bold hover:bg-white/20 transition-colors"
                                    >
                                        إغلاق
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}


                    {exportedVapUrl && (
                        <div className="space-y-4 pt-6 border-t border-white/5 animate-in fade-in slide-in-from-bottom-4">
                            <h4 className="text-white font-black text-xs uppercase tracking-widest text-sky-400">معاينة VAP (MP4)</h4>
                            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 aspect-video flex items-center justify-center">
                                <VapPlayer 
                                    src={exportedVapUrl} 
                                    width={videoWidth}
                                    height={videoHeight}
                                    className="w-full h-full"
                                />
                            </div>
                            <a 
                                href={exportedVapUrl} 
                                download={`${metadata.name.replace('.svga', '')}_VAP.mp4`}
                                className="block w-full py-3 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-center text-[10px] font-black uppercase hover:bg-sky-500/30 transition-colors"
                            >
                                تحميل الفيديو مرة أخرى
                            </a>
                        </div>
                    )}
                    
                    <div className="space-y-6 pt-4 border-t border-white/5">
                        <h5 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Layers className="w-3 h-3" />
                            تدرج الشفافية (Edge Fade)
                        </h5>
                        <div className="grid grid-cols-2 gap-6">
                            {['top', 'bottom', 'left', 'right'].map((dir) => (
                                <div key={dir} className="space-y-3">
                                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                                        <span>{dir === 'top' ? 'أعلى (Top)' : dir === 'bottom' ? 'أسفل (Bottom)' : dir === 'left' ? 'يسار (Left)' : 'يمين (Right)'}</span>
                                        <span className="text-sky-400">{fadeConfig[dir as keyof typeof fadeConfig]}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="50" value={fadeConfig[dir as keyof typeof fadeConfig]} 
                                        onChange={(e) => setFadeConfig(p => ({...p, [dir]: parseInt(e.target.value)}))}
                                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                       <div onClick={() => selectPresetBg(null)} className={`aspect-[9/16] rounded-xl border-2 cursor-pointer flex items-center justify-center text-[8px] text-slate-700 bg-black/20 ${activePreset === 'none' ? 'border-sky-500' : 'border-white/5'}`}>None</div>
                       {presetBgs.map(bg => (
                         <div key={bg.id} onClick={() => selectPresetBg(bg)} className={`aspect-[9/16] rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${activePreset === bg.id ? 'border-sky-500 scale-105' : 'border-white/5 opacity-60 hover:opacity-100'}`}>
                            <img src={bg.url} className="w-full h-full object-cover" />
                         </div>
                       ))}
                    </div>
                </div>
              )}

              {activeSideTab === 'optimize' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 space-y-6">
                        <div className="flex flex-col gap-2">
                           <h4 className="text-white font-black text-xs uppercase tracking-widest text-emerald-400">ضغط وتقليل حجم الملف</h4>
                           <p className="text-[10px] text-slate-400 leading-relaxed">
                               استخدم هذه الأداة لتقليل حجم ملف SVGA النهائي عن طريق ضغط الصور الداخلية (Quantization). يجب الضغط على الزر لتطبيق الضغط قبل التصدير.
                           </p>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 text-[10px] font-black uppercase">مستوى ضغط الصور</span>
                                <span className="text-emerald-400 font-black text-xs">{optimizeQuality}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="10" max="100" step="5" 
                                value={optimizeQuality} 
                                onChange={(e) => setOptimizeQuality(parseInt(e.target.value))} 
                                className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between text-[8px] text-slate-600 font-black uppercase">
                                <span>أقصى ضغط (حجم صغير)</span>
                                <span>جودة أصلية (حجم كبير)</span>
                            </div>
                        </div>

                        <button 
                            onClick={handleOptimizeAssets}
                            disabled={isOptimizing}
                            className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isOptimizing ? 'bg-slate-800 text-slate-600' : 'bg-emerald-500 text-white shadow-glow-emerald hover:bg-emerald-400'}`}
                        >
                            {isOptimizing ? 'جاري الضغط...' : 'تطبيق ضغط الصور الآن'}
                        </button>
                        <p className="text-[8px] text-center text-slate-500 font-black uppercase tracking-widest mt-2">
                            ملاحظة: هذا الإجراء سيقوم بتعديل الصور الحالية في الذاكرة.
                        </p>
                    </div>
                </div>
              )}
             <div className="flex flex-wrap gap-2">
                {['AE Project', 'SVGA 2.0', 'Image Sequence', 'GIF (Animation)', 'APNG (Animation)', 'WebM (Video)', 'WebP (Animated)', 'VAP (MP4)'].map(f => (
                  <button key={f} onClick={() => setSelectedFormat(f)} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black border transition-all whitespace-nowrap ${selectedFormat === f ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-950/40 text-slate-300'}`}>{f}</button>
                ))}
             </div>
             <button onClick={handleMainExport} className="w-full py-5 bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-black rounded-[2rem] shadow-glow-sky active:scale-95">بدء التصدير الاحترافي</button>
          </div>
        </div>
      </div>

      {fadeModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-white font-bold text-sm">تلاشي الحواف (Edge Fade)</h3>
                    <button onClick={() => setFadeModalTarget(null)} className="text-white/50 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="aspect-square bg-black/50 rounded-xl border border-white/5 flex items-center justify-center overflow-hidden relative">
                        {layerImages[fadeModalTarget] && (
                            <img 
                                src={layerImages[fadeModalTarget]} 
                                className="max-w-full max-h-full object-contain transition-all duration-300" 
                                style={{
                                    maskImage: `linear-gradient(to bottom, transparent, black ${fadeModalValues.top}%, black ${100 - fadeModalValues.bottom}%, transparent), linear-gradient(to right, transparent, black ${fadeModalValues.left}%, black ${100 - fadeModalValues.right}%, transparent)`,
                                    WebkitMaskImage: `linear-gradient(to bottom, transparent, black ${fadeModalValues.top}%, black ${100 - fadeModalValues.bottom}%, transparent), linear-gradient(to right, transparent, black ${fadeModalValues.left}%, black ${100 - fadeModalValues.right}%, transparent)`,
                                    maskComposite: 'intersect',
                                    WebkitMaskComposite: 'source-in'
                                }}
                            />
                        )}
                    </div>
                    <div className="space-y-4">
                        <TransformControl label="أعلى (Top)" value={fadeModalValues.top} min={0} max={50} step={1} onChange={v => setFadeModalValues(p => ({ ...p, top: v }))} />
                        <TransformControl label="أسفل (Bottom)" value={fadeModalValues.bottom} min={0} max={50} step={1} onChange={v => setFadeModalValues(p => ({ ...p, bottom: v }))} />
                        <TransformControl label="يسار (Left)" value={fadeModalValues.left} min={0} max={50} step={1} onChange={v => setFadeModalValues(p => ({ ...p, left: v }))} />
                        <TransformControl label="يمين (Right)" value={fadeModalValues.right} min={0} max={50} step={1} onChange={v => setFadeModalValues(p => ({ ...p, right: v }))} />
                    </div>
                </div>
                <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end gap-2">
                    <button onClick={() => setFadeModalTarget(null)} className="px-4 py-2 bg-white/10 text-white rounded-lg text-xs font-bold hover:bg-white/20 transition-colors">إلغاء</button>
                    <button onClick={handleApplyFade} className="px-6 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors shadow-glow-emerald">تطبيق التلاشي</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const TransformControl: React.FC<{ label: string, value: number, min: number, max: number, step?: number, onChange: (v: number) => void }> = ({ label, value, min, max, step = 1, onChange }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center px-1">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-[10px] font-bold text-white bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">{value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-sky-500 cursor-pointer" />
  </div>
);
