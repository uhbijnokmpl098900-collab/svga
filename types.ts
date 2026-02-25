
export interface Feature {
  id: number;
  name: string;
  description: string;
  icon: string;
}

export enum AppState {
  LOGIN = 'LOGIN',
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  EXPORTING = 'EXPORTING',
  ADMIN_PANEL = 'ADMIN_PANEL',
  BATCH_COMPRESSOR = 'BATCH_COMPRESSOR',
  STORE = 'STORE',
  VIDEO_CONVERTER = 'VIDEO_CONVERTER'
}

export type SubscriptionType = 'monthly' | 'quarterly' | 'yearly' | 'none';

export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  videoUrl: string;
  imageUrl: string;
  supportedFormats: string[];
  createdAt: any;
}

export interface StoreOrder {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  username: string;
  userWhatsapp?: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  giftUrl?: string;
  price: number;
  quantity: number;
  contactMethod: 'whatsapp' | 'platform';
  selectedFormat: string;
  createdAt: any;
}

export interface UserRecord {
  id: string;
  name: string;
  password?: string;
  role: 'admin' | 'user';
  isApproved: boolean;
  isVIP: boolean;
  subscriptionExpiry: any; // Firebase Timestamp
  subscriptionType: SubscriptionType;
  activatedKey?: string;
  status: 'active' | 'banned' | 'pending';
  coins: number;
  freeAttempts: number; // New field for trial
  createdAt: any;
  lastLogin: any;
}

export interface PresetBackground {
  id: string;
  label: string;
  url: string;
  createdAt: any;
}

export interface LicenseKey {
  id: string;
  key: string;
  duration: SubscriptionType;
  isUsed: boolean;
  usedBy?: string; // Username
  usedAt?: any;
  createdAt: any;
  expiresAt: any; // تاريخ انتهاء صلاحية الكود نفسه (24 ساعة من الانشاء)
}

export interface AppSettings {
  appName: string;
  logoUrl: string;
  backgroundUrl: string;
  whatsappNumber?: string;
  isRegistrationOpen: boolean;
  defaultFreeAttempts?: number;
  costs: {
    svgaProcess: number;
    batchCompress: number;
    vipPrice: number;
  }
}

export interface ProcessLog {
  id: string;
  fileName: string;
  userName: string;
  timestamp: any;
  fileSize: number;
  dimensions: string;
  frames: number;
  fileUrl?: string;
}

export interface MaterialAsset {
  id: string;
  type: 'image' | 'audio';
  name: string;
  size: string;
  dimensions?: string;
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  dimensions?: { width: number; height: number };
  fps?: number;
  frames?: number;
  assets?: MaterialAsset[];
  videoItem?: any;
  fileUrl?: string;
}
