import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Layer, TracingImage } from '../types';

// Initialize Firebase App and Services
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error Handling conforming to strict Firebase skill requirements
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Test connection to Firestore on initialization
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Document Interface definition - Login-free for lessons & multi-computer library use
export interface CloudDocument {
  id: string;
  title: string;
  ownerId?: string;
  studentName: string;
  lessonName?: string;
  layers: Layer[];
  tracingImage?: TracingImage | null;
  artboardWidth: number;
  artboardHeight: number;
  unit: string;
  thumbnailSvg?: string;
  createdAt: any;
  updatedAt: any;
}

// Optional Auth Helpers if ever needed
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logOut(): Promise<void> {
  await firebaseSignOut(auth);
}

// Cloud Documents CRUD operations (Login-free: all learners can access saved lesson documents)
export async function fetchUserDocuments(_userId?: string): Promise<CloudDocument[]> {
  const collectionPath = 'documents';
  try {
    const snapshot = await getDocs(collection(db, collectionPath));
    const docs: CloudDocument[] = [];
    snapshot.forEach(docSnap => {
      docs.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<CloudDocument, 'id'>)
      });
    });
    // Sort client-side by updatedAt descending
    docs.sort((a, b) => {
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : 0);
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
    return docs;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionPath);
  }
}

export async function fetchDocumentById(documentId: string): Promise<CloudDocument | null> {
  const docPath = `documents/${documentId}`;
  try {
    const docSnap = await getDoc(doc(db, 'documents', documentId));
    if (!docSnap.exists()) return null;
    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<CloudDocument, 'id'>)
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath);
  }
}

export async function saveDocumentToCloud(
  docData: {
    id?: string;
    title: string;
    studentName: string;
    lessonName?: string;
    layers: Layer[];
    tracingImage?: TracingImage | null;
    artboardWidth: number;
    artboardHeight: number;
    unit: string;
    thumbnailSvg?: string;
  }
): Promise<string> {
  const docId = docData.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const docPath = `documents/${docId}`;

  // Clean data according to schema
  const cleanTitle = (docData.title.trim() || 'Untitled Vector Design').slice(0, 100);
  const cleanStudent = (docData.studentName.trim() || 'Student Maker').slice(0, 60);
  const cleanLesson = (docData.lessonName?.trim() || '').slice(0, 100);

  // Deep sanitize layers to avoid undefined or non-serializable fields
  const sanitizedLayers = JSON.parse(JSON.stringify(docData.layers)).slice(0, 50);

  // Sanitize tracing reference image if present
  let sanitizedTracingImage: any = null;
  if (docData.tracingImage) {
    sanitizedTracingImage = {
      id: String(docData.tracingImage.id || 'trace-img'),
      url: String(docData.tracingImage.url || ''),
      name: String(docData.tracingImage.name || 'reference.jpg'),
      x: Number(docData.tracingImage.x) || 0,
      y: Number(docData.tracingImage.y) || 0,
      scale: Number(docData.tracingImage.scale) || 1,
      rotate: Number(docData.tracingImage.rotate) || 0,
      opacity: typeof docData.tracingImage.opacity === 'number' ? docData.tracingImage.opacity : 0.5,
      visible: Boolean(docData.tracingImage.visible),
      locked: Boolean(docData.tracingImage.locked)
    };
  }

  try {
    if (docData.id) {
      // Update existing document
      const payload: any = {
        title: cleanTitle,
        studentName: cleanStudent,
        layers: sanitizedLayers,
        artboardWidth: Number(docData.artboardWidth) || 800,
        artboardHeight: Number(docData.artboardHeight) || 600,
        unit: docData.unit || 'mm',
        updatedAt: serverTimestamp()
      };
      if (cleanLesson) {
        payload.lessonName = cleanLesson;
      }
      if (sanitizedTracingImage) {
        payload.tracingImage = sanitizedTracingImage;
      }
      if (docData.thumbnailSvg) {
        payload.thumbnailSvg = docData.thumbnailSvg.slice(0, 20000);
      }

      await setDoc(doc(db, 'documents', docId), payload, { merge: true });
      return docId;
    } else {
      // Create new document
      const payload: any = {
        title: cleanTitle,
        studentName: cleanStudent,
        layers: sanitizedLayers,
        artboardWidth: Number(docData.artboardWidth) || 800,
        artboardHeight: Number(docData.artboardHeight) || 600,
        unit: docData.unit || 'mm',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (cleanLesson) {
        payload.lessonName = cleanLesson;
      }
      if (sanitizedTracingImage) {
        payload.tracingImage = sanitizedTracingImage;
      }
      if (docData.thumbnailSvg) {
        payload.thumbnailSvg = docData.thumbnailSvg.slice(0, 20000);
      }

      await setDoc(doc(db, 'documents', docId), payload);
      return docId;
    }
  } catch (err) {
    const op = docData.id ? OperationType.UPDATE : OperationType.CREATE;
    handleFirestoreError(err, op, docPath);
  }
}

export async function deleteDocumentFromCloud(documentId: string): Promise<void> {
  const docPath = `documents/${documentId}`;
  try {
    await deleteDoc(doc(db, 'documents', documentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}
