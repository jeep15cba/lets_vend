import Devices from '../components/Devices';
import Login from '../components/Login';
import Navigation from '../components/Navigation';
import Head from 'next/head';
import { useAuth } from '../contexts/AuthContext';

export default function DevicesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <>
        <Head>
          <title>Devices - Cantaloupe DEX Dashboard</title>
          <meta name="description" content="Vending machine devices management" />
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
        <title>Devices - Cantaloupe DEX Dashboard</title>
        <meta name="description" content="Vending machine devices management" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      {user ? (
        <>
          <Navigation />
          <Devices />
        </>
      ) : (
        <Login />
      )}
    </>
  );
}