

import React, { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, AuthError } from 'firebase/auth';
import { auth } from './services/firebase';
import { fetchConversations, createConversation, updateConversation as saveConversation } from './services/firestore';
import type { Message, Model, ViewId, AspectRatio, User, Conversation, ChatTool } from './types';
import { ModelId, Tool } from './types';
import {
  BotIcon, UserIcon, SparklesIcon, SendIcon, ImageIcon, VideoIcon, CodeIcon, MicIcon,
  PlusIcon, MessageSquareIcon, EditIcon, SunIcon, MoonIcon, CheckIcon, CopyIcon,
  GlobeIcon, MapPinIcon, LogOutIcon, SettingsIcon, XIcon, PaperclipIcon, Volume2Icon, StopCircleIcon
} from './components/Icons';
import { Button, GlassCard, Select, Spinner, Textarea, Input, Modal, Popover, ToggleSwitch } from './components/UI';
import {
  generateChatResponseStream, generateImage, editImage, generateVideo, checkVideoStatus,
  fetchVideo, generateCode, connectLive, transcribeAudio, generateSpeech
} from './services/gemini';
import { fileToDataUrl, decode, decodeAudioData } from './utils';
import { GroundingChunk } from '@google/genai';

// --- CONSTANTS ---
const MODELS: Model[] = [
  { id: ModelId.GEMINI_FLASH, name: 'Ripo S1', description: 'Fast and efficient for most tasks.', speed: 'Fast' },
  { id: ModelId.GEMINI_PRO, name: 'Ripo S2', description: 'Advanced reasoning for complex queries.', speed: 'Medium' },
];

const CHAT_TOOLS: Tool[] = [
    { id: 'chat', name: 'Chat', icon: <MessageSquareIcon className="h-5 w-5" />, placeholder: "Ask me anything, or upload an image to discuss..." },
    { id: 'image-gen', name: 'Image Gen', icon: <ImageIcon className="h-5 w-5" />, placeholder: "Describe the image you want to create..." },
    { id: 'image-edit', name: 'Image Edit', icon: <EditIcon className="h-5 w-5" />, placeholder: "Upload an image and describe your edit..." },
    { id: 'video-gen', name: 'Video Gen', icon: <VideoIcon className="h-5 w-5" />, placeholder: "Describe a video, or upload an image to animate..." },
    { id: 'video-analysis', name: 'Video Analysis', icon: <VideoIcon className="h-5 w-5" />, placeholder: "Upload a video and ask a question about it..." },
    { id: 'audio-transcription', name: 'Transcription', icon: <MicIcon className="h-5 w-5" />, placeholder: "Click the record button to start..." },
    { id: 'canvas', name: 'Canvas', icon: <CodeIcon className="h-5 w-5" />, placeholder: "Describe the web app you want to build..." },
];

const GREETING_MESSAGE: Message = {
    id: 'initial-greeting',
    role: 'model',
    text: "Hello! I'm RipoAI. Your advanced AI assistant. What can I help you with today?",
};

// --- HOOKS ---
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });
    const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
        try {
            setStoredValue(currentValue => {
                const valueToStore = value instanceof Function ? value(currentValue) : value;
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
                return valueToStore;
            });
        } catch (error) {
            console.error(error);
        }
    };
    return [storedValue, setValue];
}

// --- MAIN APP COMPONENT ---
export default function App() {
    const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'dark');
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useLocalStorage<string | null>('activeConversationId', null);
    const [useSearch, setUseSearch] = useState(false);
    const [useThinkingMode, setUseThinkingMode] = useState(false);
    const [appError, setAppError] = useState<string | null>(null);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove(theme === 'dark' ? 'light' : 'dark');
        root.classList.add(theme);
    }, [theme]);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userData = {
                    uid: firebaseUser.uid,
                    name: firebaseUser.displayName || firebaseUser.email,
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL,
                };
                setUser(userData);
                
                try {
                  const userConversations = await fetchConversations(userData.uid);
                  if (userConversations.length > 0) {
                      setConversations(userConversations);
                      if (!userConversations.some(c => c.id === activeConvId)) {
                          setActiveConvId(userConversations[0].id);
                      }
                  } else {
                      // Create first conversation for new user
                      await handleNewConversation(userData.uid);
                  }
                } catch(error: any) {
                    console.error("Critical App Error:", error);
                    setAppError(error.message);
                }

            } else {
                setUser(null);
                setConversations([]);
                setActiveConvId(null);
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = () => {
        signOut(auth);
    };

    const handleNewConversation = async (uid?: string) => {
        const userId = uid || user?.uid;
        if (!userId) return;

        try {
          const newConvData: Omit<Conversation, 'id'> = {
              title: "New Chat",
              messages: [GREETING_MESSAGE],
              model: ModelId.GEMINI_FLASH,
          };
          const newConv = await createConversation(userId, newConvData);
          setConversations(prev => [newConv, ...prev]);
          setActiveConvId(newConv.id);
        } catch(error: any) {
           console.error("Failed to create new conversation:", error);
           setAppError(error.message);
        }
    };
    
    const updateConversation = (convId: string, updatedMessages: Message[], newModel?: ModelId) => {
        setConversations(prev => {
            const newConversations = prev.map(c => {
                if (c.id === convId) {
                    const updatedConv = { ...c, messages: updatedMessages, model: newModel || c.model };
                    if (user) {
                        saveConversation(user.uid, updatedConv).catch(error => {
                            console.error("Failed to save conversation:", error);
                            // Non-critical error, log it but don't disrupt UI
                        });
                    }
                    return updatedConv;
                }
                return c;
            });
            return newConversations;
        });
    };

    const activeConversation = conversations.find(c => c.id === activeConvId) || null;

    if (appError) {
        return <ErrorOverlay message={appError} />;
    }
    if (authLoading) {
        return <div className="flex h-screen w-full items-center justify-center bg-gray-100 dark:bg-gray-900"><Spinner className="h-10 w-10" /></div>;
    }
    if (!user) {
        return <Auth />;
    }
    
    if (!activeConversation) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="text-center">
                    <Spinner className="h-10 w-10 mx-auto mb-4" />
                    <p>Loading conversations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-gray-100 dark:bg-black/80 text-gray-900 dark:text-gray-200">
            <Sidebar
                user={user}
                onLogout={handleLogout}
                conversations={conversations}
                activeConversationId={activeConvId!}
                onSelectConversation={setActiveConvId}
                onNewConversation={() => handleNewConversation()}
            />
            <main className="flex flex-1 flex-col bg-white dark:bg-gray-900/50">
                <Header
                    theme={theme}
                    onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    conversation={activeConversation}
                    onModelChange={(modelId) => setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, model: modelId } : c))}
                    useSearch={useSearch}
                    onUseSearchChange={setUseSearch}
                    useThinkingMode={useThinkingMode}
                    onUseThinkingModeChange={setUseThinkingMode}
                />
                <div className="flex-1 overflow-y-auto">
                    <ChatInterface
                        key={activeConversation.id} // Re-mount component on conversation change
                        conversation={activeConversation}
                        onUpdateConversation={updateConversation}
                        useSearch={useSearch}
                        useThinkingMode={useThinkingMode}
                    />
                </div>
            </main>
        </div>
    );
}

// --- AUTH COMPONENT ---
const Auth: React.FC<{}> = () => {
    const [isSigningUp, setIsSigningUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isSigningUp) {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (err: unknown) {
            // Fix: Cast the error to a type with `code` and `message` properties to resolve a TypeScript error.
            // The imported `AuthError` type was not correctly recognized as having these properties.
            const authError = err as { code: string; message: string };
            switch (authError.code) {
                case 'auth/email-already-in-use':
                    setError('This email is already registered. Please sign in.');
                    break;
                case 'auth/invalid-credential':
                    setError('Incorrect email or password. Please try again.');
                    break;
                case 'auth/weak-password':
                    setError('Password should be at least 6 characters long.');
                    break;
                default:
                    setError(authError.message || 'An unexpected error occurred.');
                    break;
            }
        } finally {
            setLoading(false);
        }
    };
    
    return (
      <Modal isOpen={true}>
        <GlassCard className="w-full">
            <div className="text-center mb-8">
                <SparklesIcon className="h-12 w-12 text-indigo-400 mx-auto mb-2" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    {isSigningUp ? 'Create an Account' : 'Welcome to RipoAI'}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {isSigningUp ? 'Get started with your AI journey.' : 'Sign in to continue.'}
                </p>
            </div>
            <form onSubmit={handleAuthAction} className="space-y-4">
                <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
                <Button type="submit" className="w-full text-base" disabled={loading}>
                    {loading ? <Spinner /> : (isSigningUp ? 'Sign Up' : 'Sign In')}
                </Button>
            </form>
            {error && <p className="text-red-500 text-sm text-center mt-4">{error}</p>}
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
                {isSigningUp ? 'Already have an account?' : "Don't have an account?"}
                <button onClick={() => { setIsSigningUp(!isSigningUp); setError(''); }} className="font-semibold text-indigo-500 hover:underline ml-1">
                    {isSigningUp ? 'Sign In' : 'Sign Up'}
                </button>
            </p>
        </GlassCard>
      </Modal>
    );
};

// --- ERROR OVERLAY COMPONENT ---
const ErrorOverlay: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <GlassCard className="max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-red-500 mb-4">Application Error</h2>
            <p className="text-slate-800 dark:text-gray-300 mb-6">A critical error occurred while connecting to the database. Please follow the instructions below to resolve the issue.</p>
            <div className="bg-gray-200 dark:bg-black/50 p-4 rounded-lg">
                <pre className="text-sm text-slate-800 dark:text-gray-200 whitespace-pre-wrap font-mono">{message}</pre>
            </div>
        </GlassCard>
    </div>
);

// --- LAYOUT COMPONENTS ---
interface SidebarProps {
    user: User;
    onLogout: () => void;
    conversations: Conversation[];
    activeConversationId: string;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
}
const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, conversations, activeConversationId, onSelectConversation, onNewConversation }) => (
  <aside className="w-72 flex-col border-r border-black/10 dark:border-white/10 p-4 hidden md:flex bg-gray-200 dark:bg-gray-900">
    <div className="flex items-center gap-2 mb-8">
      <SparklesIcon className="h-8 w-8 text-indigo-400" />
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">RipoAI</h1>
    </div>
    <Button variant="secondary" className="w-full justify-start" onClick={onNewConversation}>
      <PlusIcon className="h-5 w-5" /> New Chat
    </Button>
    <nav className="mt-8 flex-1 space-y-1 overflow-y-auto -mr-2 pr-2">
      {conversations.map(conv => (
        <button
          key={conv.id}
          onClick={() => onSelectConversation(conv.id)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors truncate text-left ${
            activeConversationId === conv.id ? 'bg-indigo-600 text-white' : 'hover:bg-black/10 dark:hover:bg-white/10'
          }`}
        >
          <MessageSquareIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{conv.title}</span>
        </button>
      ))}
    </nav>
    <div className="mt-auto border-t border-black/10 dark:border-white/10 pt-4">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3 cursor-pointer">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.name || 'User'} className="h-8 w-8 rounded-full" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-white">
                  {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                </div>
              )}
              <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{user.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{user.email}</p>
              </div>
           </div>
           <Button variant="ghost" onClick={onLogout} className="px-2">
                <LogOutIcon className="h-5 w-5"/>
           </Button>
        </div>
    </div>
  </aside>
);

interface HeaderProps {
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    conversation: Conversation;
    onModelChange: (model: ModelId) => void;
    useSearch: boolean;
    onUseSearchChange: (value: boolean) => void;
    useThinkingMode: boolean;
    onUseThinkingModeChange: (value: boolean) => void;
}
const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme, conversation, onModelChange, useSearch, onUseSearchChange, useThinkingMode, onUseThinkingModeChange }) => (
  <header className="flex h-16 items-center justify-between border-b border-black/10 dark:border-white/10 px-6 shrink-0">
    <div className="flex items-center gap-6">
        <Select value={conversation.model} onChange={e => onModelChange(e.target.value as ModelId)}>
            {MODELS.map(model => (
                <option key={model.id} value={model.id}>{model.name} ({model.speed})</option>
            ))}
        </Select>
        <div className="hidden md:flex items-center gap-6">
            <ToggleSwitch label="Web Search" checked={useSearch} onChange={onUseSearchChange} />
            <ToggleSwitch label="Thinking Mode" checked={useThinkingMode} onChange={onUseThinkingModeChange} />
        </div>
    </div>
    <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onToggleTheme} className="p-2 aspect-square">
            {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </Button>
    </div>
  </header>
);

// --- CHAT INTERFACE COMPONENT ---
interface ChatInterfaceProps {
    conversation: Conversation;
    onUpdateConversation: (convId: string, messages: Message[], newModel?: ModelId) => void;
    useSearch: boolean;
    useThinkingMode: boolean;
}
const ChatInterface: React.FC<ChatInterfaceProps> = ({ conversation, onUpdateConversation, useSearch, useThinkingMode }) => {
    const [messages, setMessages] = useState<Message[]>(conversation.messages);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
    const [activeTool, setActiveTool] = useState<ChatTool>('chat');
    
    const [isToolPopoverOpen, setIsToolPopoverOpen] = useState(false);
    const toolButtonRef = useRef<HTMLButtonElement>(null);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const endOfMessagesRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const resetInputs = () => {
        setInput('');
        setImageFile(null);
        setImageUrl(null);
        setVideoFile(null);
        setVideoUrl(null);
        if(fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSendMessage = useCallback(async () => {
        const currentInput = input;
        const currentImageFile = imageFile;
        const currentVideoFile = videoFile;
        if (!currentInput.trim() && !currentImageFile && !currentVideoFile) return;

        setIsLoading(true);
        const userMessage: Message = { id: Date.now().toString(), role: 'user', text: currentInput, image: imageUrl || undefined, video: videoUrl || undefined };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        
        resetInputs();
        
        try {
            let modelResponse: Partial<Message> = {};

            switch(activeTool) {
                case 'image-gen':
                    modelResponse.generatedImage = await generateImage(currentInput, '1:1');
                    break;
                case 'image-edit':
                    if (!currentImageFile) throw new Error("Please upload an image to edit.");
                    modelResponse.generatedImage = await editImage(currentInput, currentImageFile);
                    break;
                case 'canvas':
                    modelResponse.generatedCode = await generateCode(currentInput, useThinkingMode);
                    break;
                case 'video-gen': {
                    let videoGenerated = false;
                    const maxAttempts = 2; // Allow one retry after key selection
                    const statusMessage: Message = { id: Date.now().toString(), role: 'model', text: "Generating video... This may take a few minutes." };
                    
                    onUpdateConversation(conversation.id, [...newMessages, statusMessage]);
                
                    for (let attempt = 1; attempt <= maxAttempts && !videoGenerated; attempt++) {
                        try {
                            if (window.aistudio) {
                                if (attempt === 1) {
                                    const hasKey = await window.aistudio.hasSelectedApiKey();
                                    if (!hasKey) {
                                        await window.aistudio.openSelectKey();
                                    }
                                }
                            }
                
                            let operation = await generateVideo(currentInput, currentImageFile || undefined, aspectRatio);
                            
                            while (!operation.done) {
                                await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
                                operation = await checkVideoStatus(operation);
                            }
                
                            if (operation.error) {
                                throw new Error(operation.error.message);
                            }
                
                            const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
                            if (!uri) throw new Error("Video generation completed, but no video URI was returned.");
                            
                            const videoUrl = await fetchVideo(uri);
                            const videoMessage: Message = { id: Date.now().toString() + '-video', role: 'model', text: 'Your video has been generated!', generatedVideo: videoUrl };
                            
                            onUpdateConversation(conversation.id, [...newMessages, videoMessage]);
                            videoGenerated = true;
                
                        } catch (error: any) {
                            console.error(`Video generation failed (attempt ${attempt}):`, error);
                
                            if (window.aistudio && error.message?.includes("Requested entity was not found.")) {
                                if (attempt < maxAttempts) {
                                    alert("There was an issue with your API key. Please select a valid key to try again.");
                                    await window.aistudio.openSelectKey();
                                } else {
                                    const finalError = "Video generation failed after multiple attempts. Please check your API key and try again.";
                                    const errorMessage: Message = { id: Date.now().toString(), role: 'model', text: '', error: finalError };
                                    onUpdateConversation(conversation.id, [...newMessages, errorMessage]);
                                }
                            } else {
                                const errorMessageText = `Video generation failed: ${error.message}`;
                                const errorMessage: Message = { id: Date.now().toString(), role: 'model', text: '', error: errorMessageText };
                                onUpdateConversation(conversation.id, [...newMessages, errorMessage]);
                                break;
                            }
                        }
                    }
                    
                    setIsLoading(false);
                    return;
                }
                case 'chat':
                case 'video-analysis':
                default:
                    await handleStreamingChat(newMessages, currentInput, currentImageFile, currentVideoFile);
                    setIsLoading(false);
                    return;
            }

            const modelMessage: Message = {
                id: Date.now().toString() + '-model',
                role: 'model',
                text: `Here is the ${activeTool.replace('-',' ')} you requested.`,
                ...modelResponse
            };
            onUpdateConversation(conversation.id, [...newMessages, modelMessage]);

        } catch (error: any) {
            console.error(error);
            const errorMessage: Message = { id: Date.now().toString(), role: 'model', text: '', error: error.message };
            onUpdateConversation(conversation.id, [...newMessages, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [input, imageFile, videoFile, imageUrl, videoUrl, messages, conversation.id, onUpdateConversation, activeTool, useThinkingMode, useSearch, aspectRatio]);
    
    const handleStreamingChat = async (currentMessages: Message[], prompt: string, image: File | null, video: File | null) => {
        const history = currentMessages.slice(0, -1);
        try {
            const stream = await generateChatResponseStream(history, { prompt, image, video, model: conversation.model, useSearch, useThinkingMode });

            let modelResponseText = '';
            let modelMessageId = Date.now().toString() + '-model';
            let chunks: GroundingChunk[] = [];
            
            const placeholderMessage: Message = { id: modelMessageId, role: 'model', text: '...' };
            onUpdateConversation(conversation.id, [...currentMessages, placeholderMessage]);

            for await (const chunk of stream) {
                modelResponseText += chunk.text;
                if(chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                    chunks.push(...chunk.candidates[0].groundingMetadata.groundingChunks);
                }
                const streamingMessage: Message = { id: modelMessageId, role: 'model', text: modelResponseText, groundingChunks: chunks };
                const tempMessages = [...currentMessages, streamingMessage];
                setMessages(tempMessages);
            }
            const finalMessage: Message = { id: modelMessageId, role: 'model', text: modelResponseText, groundingChunks: chunks };
            onUpdateConversation(conversation.id, [...currentMessages, finalMessage]);

        } catch (error: any) {
            console.error(error);
            const errorMessage: Message = { id: Date.now().toString(), role: 'model', text: '', error: error.message };
            onUpdateConversation(conversation.id, [...currentMessages, errorMessage]);
        }
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            resetInputs(); // Clear other inputs
            if (file.type.startsWith('image/')) {
                setImageFile(file);
                fileToDataUrl(file).then(setImageUrl);
            } else if (file.type.startsWith('video/')) {
                setVideoFile(file);
                fileToDataUrl(file).then(setVideoUrl);
            }
        }
    };
    
    const handleStartRecording = async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = event => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "recording.webm", { type: "audio/webm" });
                const audioUrl = URL.createObjectURL(audioBlob);

                const userMessage: Message = { id: Date.now().toString(), role: 'user', text: 'Audio recording', audioSrc: audioUrl };
                const newMessages = [...messages, userMessage];
                setMessages(newMessages);
                setIsLoading(true);

                try {
                    const transcription = await transcribeAudio(audioFile);
                    const modelMessage: Message = { id: Date.now().toString() + '-model', role: 'model', text: transcription };
                    onUpdateConversation(conversation.id, [...newMessages, modelMessage]);
                } catch (error: any) {
                    const errorMessage: Message = { id: Date.now().toString(), role: 'model', text: '', error: error.message };
                    onUpdateConversation(conversation.id, [...newMessages, errorMessage]);
                } finally {
                    setIsLoading(false);
                    // Clean up stream tracks
                    stream.getTracks().forEach(track => track.stop());
                }
            };
            
            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("Could not access microphone. Please check your browser permissions.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    useEffect(() => {
        setMessages(conversation.messages);
    }, [conversation.messages]);

    const currentTool = CHAT_TOOLS.find(t => t.id === activeTool) || CHAT_TOOLS[0];
    const fileInputAccept = activeTool === 'video-analysis' ? 'video/*' : 'image/*';

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full px-4">
            <div className="flex-1 overflow-y-auto pt-6">
                {messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                <div ref={endOfMessagesRef} />
            </div>
            <div className="py-6 w-full">
                <GlassCard className="p-2 relative">
                    <Popover isOpen={isToolPopoverOpen} onClose={() => setIsToolPopoverOpen(false)} triggerRef={toolButtonRef}>
                        <div className="grid grid-cols-4 gap-1">
                          {CHAT_TOOLS.map(tool => (
                            <button key={tool.id} onClick={() => { setActiveTool(tool.id); setIsToolPopoverOpen(false); resetInputs(); }} className={`flex flex-col items-center justify-center p-2 rounded-lg aspect-square transition-colors ${activeTool === tool.id ? 'bg-indigo-600 text-white' : 'hover:bg-black/10 dark:hover:bg-white/10'}`}>
                                {tool.icon}
                                <span className="text-xs mt-1 text-center leading-tight">{tool.name}</span>
                            </button>
                          ))}
                        </div>
                    </Popover>
                    {(imageUrl || videoUrl) && (
                        <div className="p-2 relative w-fit">
                            {imageUrl && <img src={imageUrl} alt="upload preview" className="max-h-40 rounded-lg"/>}
                            {videoUrl && <video src={videoUrl} controls className="max-h-40 rounded-lg" />}
                            <button onClick={resetInputs} className="absolute -top-1 -right-1 bg-black/50 rounded-full p-1 text-white hover:bg-black/80">
                                <XIcon className="h-4 w-4"/>
                            </button>
                        </div>
                    )}
                     {activeTool === 'video-gen' && (
                        <div className="p-2 flex items-center gap-4">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Aspect Ratio:</span>
                            <div className="flex gap-2">
                                <Button variant={aspectRatio === '16:9' ? 'primary' : 'secondary'} onClick={() => setAspectRatio('16:9')} className="text-xs px-3 py-1">Landscape 16:9</Button>
                                <Button variant={aspectRatio === '9:16' ? 'primary' : 'secondary'} onClick={() => setAspectRatio('9:16')} className="text-xs px-3 py-1">Portrait 9:16</Button>
                            </div>
                        </div>
                    )}
                    <div className="flex items-end">
                        <Button ref={toolButtonRef} variant="ghost" onClick={() => setIsToolPopoverOpen(p => !p)} className="p-2">
                           {currentTool.icon}
                        </Button>
                        {activeTool !== 'audio-transcription' && (
                          <Textarea
                              ref={textareaRef}
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                              placeholder={currentTool.placeholder}
                              rows={1}
                              className="flex-1 bg-transparent border-none focus:ring-0 text-base max-h-48"
                          />
                        )}
                        {activeTool === 'audio-transcription' && (
                            <div className="flex-1 flex items-center justify-center h-10 text-gray-500 text-sm">
                                {isRecording ? "Recording..." : "Click the mic to record"}
                            </div>
                        )}
                        
                        {activeTool !== 'audio-transcription' && (
                            <label className="p-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white">
                                <PaperclipIcon className="h-6 w-6"/>
                                <input ref={fileInputRef} type="file" accept={fileInputAccept} className="hidden" onChange={handleFileChange}/>
                            </label>
                        )}
                        
                        {activeTool === 'audio-transcription' ? (
                            <Button onClick={isRecording ? handleStopRecording : handleStartRecording} className={`rounded-full w-10 h-10 p-2 aspect-square shrink-0 ${isRecording ? 'bg-red-500 animate-pulse' : ''}`}>
                                {isRecording ? <StopCircleIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
                            </Button>
                        ) : (
                            <Button onClick={handleSendMessage} disabled={isLoading} className="rounded-full w-10 h-10 p-2 aspect-square shrink-0">
                                {isLoading ? <Spinner /> : <SendIcon className="h-5 w-5" />}
                            </Button>
                        )}

                    </div>
                </GlassCard>
            </div>
        </div>
    );
};

const CodePreview: React.FC<{ code: string }> = ({ code }) => {
    const [view, setView] = useState<'preview' | 'code'>('preview');
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="mt-2 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 max-w-full">
            <div className="flex justify-between items-center px-4 py-1 bg-slate-950/70">
                <div className="flex gap-2">
                    <button onClick={() => setView('preview')} className={`text-xs px-2 py-1 rounded ${view === 'preview' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}>Preview</button>
                    <button onClick={() => setView('code')} className={`text-xs px-2 py-1 rounded ${view === 'code' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}>Code</button>
                </div>
                <Button variant="ghost" onClick={handleCopy} className="text-xs px-2 py-1">
                    {copied ? <CheckIcon className="h-4 w-4"/> : <CopyIcon className="h-4 w-4"/>} Copy
                </Button>
            </div>
            {view === 'preview' ? (
                <iframe srcDoc={code} title="Generated Code Preview" className="w-full h-96 bg-white" sandbox="allow-scripts allow-same-origin"/>
            ) : (
                <pre className="p-4 text-sm overflow-x-auto max-h-96"><code className="text-white font-mono">{code}</code></pre>
            )}
        </div>
    );
};

// ChatMessage: Renders a single message bubble
const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
    const isModel = message.role === 'model';
    const [copied, setCopied] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePlayAudio = async (text: string) => {
        if (!text) return;
        setIsGeneratingAudio(true);
        try {
            const base64Audio = await generateSpeech(text);
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            }
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioContextRef.current, 24000, 1);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
        } catch (error) {
            console.error("Failed to play audio:", error);
            alert("Sorry, could not generate audio for this message.");
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    return (
        <div className={`flex items-start gap-4 my-4`}>
            <div className={`p-2 rounded-full shrink-0 ${isModel ? 'bg-indigo-500' : 'bg-gray-600'}`}>
                {isModel ? <BotIcon className="h-5 w-5 text-white" /> : <UserIcon className="h-5 w-5 text-white" />}
            </div>
            <div className="max-w-xl group relative w-full">
                <div className={`px-4 py-3 rounded-2xl w-fit ${isModel ? 'bg-gray-200 dark:bg-gray-800' : 'bg-indigo-600 text-white'}`}>
                    {message.image && <img src={message.image} alt="user upload" className="max-w-xs rounded-lg mb-2"/>}
                    {message.video && <video src={message.video} controls className="max-w-xs rounded-lg mb-2" />}
                    {message.audioSrc && <audio src={message.audioSrc} controls className="my-2" />}

                    {message.error && <p className="text-red-500 font-semibold">{message.error}</p>}
                    {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                    
                    {message.generatedImage && <img src={message.generatedImage} alt="generated content" className="max-w-sm rounded-lg mt-2"/>}
                    {message.generatedVideo && <video src={message.generatedVideo} controls autoPlay loop className="max-w-sm rounded-lg mt-2"/>}
                    {message.generatedCode && <CodePreview code={message.generatedCode} />}

                    {message.groundingChunks && message.groundingChunks.length > 0 && (
                        <div className="mt-4 pt-2 border-t border-black/10 dark:border-white/10">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sources:</p>
                            <div className="flex flex-wrap gap-2">
                                {message.groundingChunks.map((chunk, index) => (
                                    (chunk.web || chunk.maps) && (
                                        <a 
                                          key={index} 
                                          href={chunk.web?.uri || chunk.maps?.uri} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="text-xs bg-black/10 dark:bg-black/30 hover:bg-black/20 dark:hover:bg-black/50 px-2 py-1 rounded text-indigo-600 dark:text-indigo-300 truncate"
                                        >
                                          {chunk.web?.title || chunk.maps?.title}
                                        </a>
                                    )
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                 {isModel && message.text && (
                    <div className="absolute -top-3 -right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => handlePlayAudio(message.text)} disabled={isGeneratingAudio} className="p-1.5 bg-gray-300 dark:bg-white/10 rounded-full text-gray-600 dark:text-gray-300">
                             {isGeneratingAudio ? <Spinner className="h-4 w-4" /> : <Volume2Icon className="h-4 w-4" />}
                         </button>
                        <button onClick={() => handleCopy(message.text)} className="p-1.5 bg-gray-300 dark:bg-white/10 rounded-full text-gray-600 dark:text-gray-300">
                            {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};