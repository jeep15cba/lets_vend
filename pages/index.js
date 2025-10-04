import LandingPage from '../components/LandingPage';
import Head from 'next/head';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Redirect authenticated users to devices page
  useEffect(() => {
    if (user && !loading) {
      router.push('/devices');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <>
        <Head>
          <title>VendTrack - Smart Vending Machine Management</title>
          <meta name="description" content="Professional vending machine monitoring and analytics platform powered by Cantaloupe DEX data" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>VendTrack - Smart Vending Machine Management</title>
        <meta name="description" content="Professional vending machine monitoring and analytics platform powered by Cantaloupe DEX data" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      {user ? null : <LandingPage />}
    </>
  );
}