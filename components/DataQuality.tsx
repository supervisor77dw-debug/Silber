interface DataQualityProps {
  lastFetch: any;
}

export default function DataQuality({ lastFetch }: DataQualityProps) {
  if (!lastFetch) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
        <p className="text-yellow-800 dark:text-yellow-200">
          Keine Daten verfügbar. Bitte führen Sie den ersten Datenabruf durch.
        </p>
      </div>
    );
  }

  const isError = lastFetch.status === 'error';
  const isPartial = lastFetch.status === 'partial';

  if (isError || isPartial) {
    return (
      <div className={`${isError ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'} border rounded-lg p-4 mb-6`}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-2xl">{isError ? '❌' : '⚠️'}</span>
          </div>
          <div className="ml-3">
            <h3 className={`text-sm font-medium ${isError ? 'text-red-800 dark:text-red-200' : 'text-orange-800 dark:text-orange-200'}`}>
              {isError ? 'Datenabruf fehlgeschlagen' : 'Teilweiser Datenabruf'}
            </h3>
            {lastFetch.errorMsg && (
              <p className={`mt-2 text-sm ${isError ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'}`}>
                {lastFetch.errorMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
      <div className="flex items-center">
        <span className="text-2xl mr-3">✅</span>
        <p className="text-green-800 dark:text-green-200">
          Alle Datenquellen erfolgreich abgerufen
        </p>
      </div>
    </div>
  );
}
