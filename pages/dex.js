import { AuthProvider } from '../contexts/AuthContext';
import DexList from '../components/DexList';

export default function DexPage() {
  return (
    <AuthProvider>
      <DexList />
    </AuthProvider>
  );
}