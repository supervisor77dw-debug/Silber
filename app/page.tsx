import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Dashboard />
    </main>
  );
}
