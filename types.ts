import { ReactNode } from 'react';
import { GenerateContentResponse, GroundingChunk } from '@google/genai';

export interface User {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL?: string | null;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 image from user upload
  video?: string; // data URL for video from user upload
  audioSrc?: string; // data URL for audio from user recording
  generatedImage?: string; // URL of AI-generated image
  generatedVideo?: string; // URL of AI-generated video
  generatedCode?: string; // AI-generated code string
  groundingChunks?: GroundingChunk[];
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: ModelId;
  createdAt?: Date;
  updatedAt?: Date;
}

export enum ModelId {
  GEMINI_FLASH = 'gemini-2.5-flash',
  GEMINI_FLASH_LITE = 'gemini-flash-lite-latest',
  GEMINI_PRO = 'gemini-2.5-pro',
  IMAGEN = 'imagen-4.0-generate-001',
  VEO = 'veo-3.1-fast-generate-preview',
  GEMINI_FLASH_IMAGE = 'gemini-2.5-flash-image',
  TTS = 'gemini-2.5-flash-preview-tts',
  LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025',
}

export interface Model {
  id: ModelId;
  name: string;
  description: string;
  speed: 'Fast' | 'Medium' | 'Slow';
}

export type ViewId = 'chat' | 'live-convo';

export type ChatTool = 'chat' | 'image-gen' | 'image-edit' | 'video-gen' | 'video-analysis' | 'audio-transcription' | 'canvas';

export interface Tool {
  id: ChatTool;
  name: string;
  icon: ReactNode;
  placeholder: string;
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface StreamChunk extends GenerateContentResponse {
  // The SDK's GenerateContentResponse is used directly for streaming chunks.
}

// Augment the global Window interface for aistudio methods
declare global {
  // Fix: Moved AIStudio interface into declare global to prevent module scope conflicts
  // which can cause "Subsequent property declarations must have the same type" errors.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}
