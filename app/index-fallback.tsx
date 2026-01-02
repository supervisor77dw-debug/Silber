'use client';

export default function SimpleHome() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-4xl font-bold mb-6 text-gray-900 dark:text-white">
          Silver Market Analysis
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          COMEX vs SGE Spread-Tracker
        </p>
        
        <div className="space-y-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
            <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Status</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Die Anwendung wird geladen...
            </p>
          </div>
          
          <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
            <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">API Endpoints</h2>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• <a href="/api/health" className="text-blue-600 hover:underline">/api/health</a> - System status</li>
              <li>• <a href="/api/dashboard" className="text-blue-600 hover:underline">/api/dashboard</a> - Dashboard data</li>
              <li>• <a href="/api/spreads" className="text-blue-600 hover:underline">/api/spreads</a> - Spread data</li>
            </ul>
          </div>

          <div className="border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 rounded p-4">
            <h2 className="font-semibold mb-2 text-yellow-900 dark:text-yellow-200">Setup erforderlich</h2>
            <ol className="text-sm text-yellow-800 dark:text-yellow-300 space-y-2 list-decimal list-inside">
              <li>Datenbank-URLs in Vercel konfigurieren (siehe SUPABASE_SETUP.md)</li>
              <li>Prisma Migrations ausführen: <code className="bg-yellow-100 dark:bg-yellow-900 px-1">npx prisma migrate deploy</code></li>
              <li>Ersten Datenabruf durchführen</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
