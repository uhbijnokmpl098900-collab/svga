
import React from 'react';
import { Feature } from './types';

export const CORE_FEATURES: Feature[] = [
  {
    id: 1,
    name: "Preview & Control",
    description: "Interactive player with live preview and timeline control for animations.",
    icon: "🎬"
  },
  {
    id: 2,
    name: "Smart Compression",
    description: "Reduce SVGA file size while maintaining high visual quality.",
    icon: "📦"
  },
  {
    id: 3,
    name: "Format Conversion",
    description: "Convert SVGA to other formats: GIF, WebP, Apng, VAP.",
    icon: "🔄"
  },
  {
    id: 4,
    name: "Dimension Adjust",
    description: "Resize animations with custom aspect ratio support.",
    icon: "📐"
  },
  {
    id: 5,
    name: "Material Manager",
    description: "Edit images and sounds inside SVGA files (replace, delete, rename).",
    icon: "🗂️"
  }
];

export const SUPPORTED_OUTPUTS = ["GIF", "WebP", "Apng", "PNG", "SVGA 1.0", "SVGA 2.0", "AE Project"];
