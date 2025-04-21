import { createContext, useState, useEffect, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';

// Firebase configuration - replace with your own Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
let app;
let auth;

// Only initialize Firebase on the client side
if (typeof window !== 'undefined') {
  try {
    // Check if config values are present (without logging the actual values for security)
    const configCheck = {
      apiKeyPresent: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomainPresent: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectIdPresent: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucketPresent: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderIdPresent: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appIdPresent: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    };
    
    console.log('Firebase config check:', configCheck);
    
    // If any config values are missing, log a warning
    if (Object.values(configCheck).some(value => !value)) {
      console.warn('Some Firebase configuration values are missing. Authentication may not work correctly.');
    }
    
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    console.log('Firebase Auth initialized successfully');
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

// Create a context for authentication
const AuthContext = createContext({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  login: async () => {},
  register: async () => {},
  resetPassword: async () => {},
  logout: async () => {}
});

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};

// Make sure to export the context as well
export { AuthContext };

// Authentication provider component
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState(null);

  // Listen for authentication state changes
  useEffect(() => {
    if (typeof window === 'undefined' || !auth) return;

    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        // User is signed in
        setUser({
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          photoURL: authUser.photoURL
        });
        
        // Get the ID token
        const token = await authUser.getIdToken(true);
        setAuthToken(token);
        
        // Set up token refresh
        const tokenRefreshInterval = setInterval(async () => {
          try {
            console.log('Refreshing auth token...');
            const newToken = await authUser.getIdToken(true);
            setAuthToken(newToken);
            console.log('Auth token refreshed');
          } catch (error) {
            console.error('Error refreshing token:', error);
          }
        }, 10 * 60 * 1000); // Refresh token every 10 minutes
        
        // Clear interval on cleanup
        return () => clearInterval(tokenRefreshInterval);
      } else {
        // User is signed out
        setUser(null);
        setAuthToken(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Function to manually refresh token
  const refreshToken = async () => {
    if (!auth.currentUser) {
      return null;
    }
    
    try {
      const newToken = await auth.currentUser.getIdToken(true);
      setAuthToken(newToken);
      console.log('Auth token manually refreshed');
      return newToken;
    } catch (error) {
      console.error('Error manually refreshing token:', error);
      return null;
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    if (typeof window === 'undefined' || !auth) return;

    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      return { success: true };
    } catch (error) {
      console.error('Google sign-in error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to sign in with Google' 
      };
    } finally {
      setLoading(false);
    }
  };

  // Sign in with email and password
  const login = async (email, password) => {
    if (typeof window === 'undefined' || !auth) return;

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to sign in' 
      };
    } finally {
      setLoading(false);
    }
  };

  // Register with email and password
  const register = async (email, password) => {
    if (typeof window === 'undefined' || !auth) return;

    try {
      console.log("Attempting to register with:", email);
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("Registration successful:", userCredential.user.uid);
      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // Provide more specific error messages based on Firebase error codes
      let errorMessage = 'Failed to create account';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please sign in instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please provide a valid email address.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 6 characters.';
      }
      
      return { 
        success: false, 
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  };

  // Reset password
  const resetPassword = async (email) => {
    if (typeof window === 'undefined' || !auth) return;

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send password reset email' 
      };
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const logout = async () => {
    if (typeof window === 'undefined' || !auth) return;

    try {
      setLoading(true);
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to sign out' 
      };
    } finally {
      setLoading(false);
    }
  };

  // Create an API client with the auth token
  const createApiClient = () => {
    return {
      get: async (url) => {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        return response.json();
      },
      post: async (url, data) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(data)
        });
        return response.json();
      },
      delete: async (url) => {
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        return response.json();
      }
    };
  };

  // Return the auth context value
  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading,
        authToken, 
        refreshToken,
        signInWithGoogle, 
        login, 
        register, 
        resetPassword, 
        logout,
        createApiClient
      }}
    >
      {children}
    </AuthContext.Provider>
  );
} 