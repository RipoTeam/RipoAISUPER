
import { GoogleGenAI, GenerateContentStreamResult, ModelId as GenAIModelId, Modality, Type, FunctionDeclaration, LiveSession, LiveCallbacks, GenerateVideosOperation, AspectRatio as GenAIAspectRatio, GroundingChunk } from '@google/genai';
import { type Message, ModelId, AspectRatio } from '../types';
import { fileToBase64, decode, decodeAudioData } from '../utils';

let ai: GoogleGenAI | null = null;
const getAI = () => {
    if (!ai) {
        if (!process.env.API_KEY || process.env.API_KEY.trim() === "") {
            console.error("API_KEY environment variable not set or empty.");
            throw new Error("API key is not configured. Please set the API_KEY environment variable.");
        }
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai;
}

export const getNewAI = () => {
    if (!process.env.API_KEY || process.env.API_KEY.trim() === "") {
        console.error("API_KEY environment variable not set or empty.");
        throw new Error("API key is not configured. Please set the API_KEY environment variable.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
}

interface ChatOptions {
  prompt: string;
  image?: File;
  video?: File;
  model: ModelId;
  useSearch?: boolean;
  useMaps?: boolean;
  useThinkingMode?: boolean;
}

export const generateChatResponseStream = async (
  history: Message[],
  options: ChatOptions
): Promise<GenerateContentStreamResult> => {
  try {
    const { prompt, image, video, model, useSearch, useMaps, useThinkingMode } = options;
    const ai = getAI();
    
    const userParts: any[] = [{ text: prompt }];
    if (image) {
      userParts.push({ inlineData: { mimeType: image.type, data: await fileToBase64(image) } });
    }
    if (video) {
      userParts.push({ inlineData: { mimeType: video.type, data: await fileToBase64(video) } });
    }

    const contents = [...history.map(msg => ({
        role: msg.role,
        parts: [{text: msg.text}] // simplified history for context
      })), 
      { role: 'user', parts: userParts }
    ];

    const config: any = {};
    const tools: any[] = [];
    if (useSearch) tools.push({ googleSearch: {} });
    if (useMaps) tools.push({ googleMaps: {} });
    if (tools.length > 0) config.tools = tools;

    let effectiveModel: GenAIModelId = model as GenAIModelId;
    // Video analysis requires a more powerful model
    if (video && model === ModelId.GEMINI_FLASH) {
        effectiveModel = ModelId.GEMINI_PRO as GenAIModelId;
    }

    if (useThinkingMode) {
        effectiveModel = ModelId.GEMINI_PRO as GenAIModelId;
        config.thinkingConfig = { thinkingBudget: 32768 };
    }

    // Use a stateless generateContentStream for simplicity
    return ai.models.generateContentStream({
        model: effectiveModel,
        contents,
        config,
    });
  } catch(error: any) {
    console.error("Chat Error:", error);
    throw new Error(error.message || "Failed to get chat response. Check your API key and network.");
  }
};

export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    try {
        const ai = getAI();
        const response = await ai.models.generateImages({
            model: ModelId.IMAGEN as GenAIModelId,
            prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: aspectRatio as GenAIAspectRatio,
            },
        });

        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error("Image generation failed to produce an image.");
        }
        
        return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
    } catch(error: any) {
        console.error("Image Generation Error:", error);
        throw new Error(error.message || "Failed to generate image. Please try again.");
    }
};

export const editImage = async (prompt: string, imageFile: File): Promise<string> => {
    try {
        const ai = getAI();
        const base64Image = await fileToBase64(imageFile);
        
        const response = await ai.models.generateContent({
            model: ModelId.GEMINI_FLASH_IMAGE as GenAIModelId,
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType: imageFile.type } },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        throw new Error("Image editing failed to produce an image.");
    } catch(error: any) {
        console.error("Image Edit Error:", error);
        throw new Error(error.message || "Failed to edit image. Please try again.");
    }
};


export const generateVideo = async (prompt: string, imageFile?: File, aspectRatio: "16:9" | "9:16" = "16:9"): Promise<GenerateVideosOperation> => {
    try {
        const ai = getNewAI(); // Use new instance for Veo with potentially updated key
        const imagePayload = imageFile ? {
            imageBytes: await fileToBase64(imageFile),
            mimeType: imageFile.type,
        } : undefined;

        return ai.models.generateVideos({
            model: ModelId.VEO as GenAIModelId,
            prompt,
            image: imagePayload,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: aspectRatio,
            }
        });
    } catch(error: any) {
        console.error("Video Generation Error:", error);
        throw new Error(error.message || "Failed to start video generation.");
    }
}

export const checkVideoStatus = async (operation: GenerateVideosOperation): Promise<GenerateVideosOperation> => {
    const ai = getNewAI();
    return ai.operations.getVideosOperation({ operation });
}

export const fetchVideo = async (uri: string): Promise<string> => {
    const response = await fetch(`${uri}&key=${process.env.API_KEY}`);
    if (!response.ok) {
        throw new Error("Failed to fetch the generated video file.");
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}


export const generateCode = async (prompt: string, useThinkingMode?: boolean): Promise<string> => {
    try {
        const ai = getAI();
        const config: any = {
            systemInstruction: `You are an expert web developer. Your task is to generate clean, self-contained HTML, CSS, and JavaScript code based on the user's request. 
                - The output MUST be a single HTML file.
                - All CSS MUST be in a <style> tag in the <head>.
                - All JavaScript MUST be in a <script> tag at the end of the <body>.
                - Do not use any external libraries or frameworks unless explicitly asked.
                - Do not include any explanations, comments, or markdown formatting like \`\`\`html.
                - Only output the raw HTML code.
                - If the user provides existing code and asks for a modification, you MUST modify the provided code.
                - Analyze the request carefully and fix any potential bugs or errors in the generated code proactively.`,
            responseMimeType: 'text/plain',
        };

        let effectiveModel = ModelId.GEMINI_PRO as GenAIModelId; // Default to Pro for code
        if (useThinkingMode) {
            config.thinkingConfig = { thinkingBudget: 32768 };
        }

        const response = await ai.models.generateContent({
            model: effectiveModel,
            contents: prompt,
            config
        });
        return response.text;
    } catch(error: any) {
        console.error("Code Generation Error:", error);
        throw new Error(error.message || "Failed to generate code.");
    }
}

export const transcribeAudio = async (audioFile: File): Promise<string> => {
    try {
        const ai = getAI();
        const audioData = await fileToBase64(audioFile);
        const response = await ai.models.generateContent({
            model: ModelId.GEMINI_FLASH as GenAIModelId,
            contents: {
                parts: [
                    { inlineData: { mimeType: audioFile.type, data: audioData } },
                    { text: "Transcribe the audio." }
                ]
            }
        });
        return response.text;
    } catch (error: any) {
        console.error("Audio Transcription Error:", error);
        throw new Error(error.message || "Failed to transcribe audio.");
    }
};

export const generateSpeech = async (text: string): Promise<string> => {
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: ModelId.TTS as GenAIModelId,
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("Audio generation failed to produce data.");
        }
        return base64Audio;
    } catch (error: any) {
        console.error("Speech Generation Error:", error);
        throw new Error(error.message || "Failed to generate speech.");
    }
};

export const connectLive = async (callbacks: LiveCallbacks): Promise<LiveSession> => {
    try {
        const ai = getAI();
        return ai.live.connect({
            model: ModelId.LIVE as GenAIModelId,
            callbacks,
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: "You are RipoAI, a friendly and helpful conversational AI. Keep your responses concise and natural."
            }
        });
    } catch (error: any) {
        console.error("Live Connect Error:", error);
        throw new Error(error.message || "Failed to connect to live conversation service.");
    }
};
