import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DexList from '../components/DexList';
import { useAuth } from '../contexts/AuthContext';

export default function DexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <>
      <Head>
        <title>DEX Data - VendTrack</title>
        <meta name="description" content="View and manage DEX data from vending machines" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <DexList />
    </>
  );
}