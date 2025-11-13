import { db } from './firebase';
import { collection, doc, getDocs, setDoc, addDoc, query, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
import { Conversation, Message } from '../types';

const PERMISSION_ERROR_MESSAGE = `FirebaseError: Missing or insufficient permissions.

This usually means your Firestore Security Rules are not set up correctly.
To fix this, go to your Firebase project console:
1. Navigate to 'Build' -> 'Firestore Database'.
2. Click on the 'Rules' tab.
3. Replace the existing rules with the following and click 'Publish':

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read and write their own data
    match /users/{userId}/{documents=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
`;

// Firestore data converter
const conversationConverter = {
  toFirestore: (conversation: Conversation) => {
    return {
      ...conversation,
      createdAt: conversation.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    };
  },
  fromFirestore: (snapshot: any, options: any): Conversation => {
    const data = snapshot.data(options);
    return {
      ...data,
      id: snapshot.id,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as Conversation;
  }
};

export const fetchConversations = async (userId: string): Promise<Conversation[]> => {
  try {
    const conversationsRef = collection(db, 'users', userId, 'conversations');
    const q = query(conversationsRef, orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q.withConverter(conversationConverter));
    return querySnapshot.docs.map(doc => doc.data());
  } catch (error: any) {
    console.error("Error fetching conversations: ", error);
    if (error.code === 'permission-denied') {
        throw new Error(PERMISSION_ERROR_MESSAGE);
    }
    throw new Error('Failed to fetch conversations from the database.');
  }
};

export const createConversation = async (userId: string, conversationData: Omit<Conversation, 'id'>): Promise<Conversation> => {
    try {
        const conversationsRef = collection(db, 'users', userId, 'conversations');
        const docRef = await addDoc(conversationsRef.withConverter(conversationConverter), conversationData as Conversation);
        return { ...conversationData, id: docRef.id };
    } catch (error: any) {
        console.error("Error creating conversation: ", error);
        if (error.code === 'permission-denied') {
            throw new Error(PERMISSION_ERROR_MESSAGE);
        }
        throw new Error('Failed to create a new conversation.');
    }
};


export const updateConversation = async (userId: string, conversation: Conversation): Promise<void> => {
  try {
    const conversationRef = doc(db, 'users', userId, 'conversations', conversation.id).withConverter(conversationConverter);
    await setDoc(conversationRef, conversation, { merge: true });
  } catch (error: any) {
    console.error("Error updating conversation: ", error);
     if (error.code === 'permission-denied') {
        throw new Error(PERMISSION_ERROR_MESSAGE);
    }
    throw new Error('Failed to save conversation changes.');
  }
};
