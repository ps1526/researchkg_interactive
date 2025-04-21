import '../styles/globals.css';
import Head from 'next/head';
import AuthProvider from '../components/AuthProvider';

// Log environment variable presence for debugging (remove in production)
if (typeof window !== 'undefined') {
  console.log('Firebase env vars check:', {
    apiKeyExists: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomainExists: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucketExists: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  });
}

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <>
        <Head>
          <title>Research Knowledge Graph Explorer</title>
          <meta name="description" content="Interactive citation graph explorer" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        
        <style jsx global>{`
          /* Global styles for clickable references */
          .clickable-reference {
            color: #2563EB !important;
            text-decoration: underline !important;
            cursor: pointer !important;
          }
          
          .clickable-reference:hover {
            opacity: 0.8;
          }
          
          .paper-reference {
            color: #2563EB !important;
          }
          
          .author-reference {
            color: #7C3AED !important;
          }
        `}</style>
        
        <Component {...pageProps} />
      </>
    </AuthProvider>
  );
}

export default MyApp;