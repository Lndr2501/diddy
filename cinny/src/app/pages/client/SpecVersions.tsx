import React, { ReactNode } from 'react';
import { SpecVersionsLoader } from '../../components/SpecVersionsLoader';
import { SpecVersionsProvider } from '../../hooks/useSpecVersions';
import { ConnectionRecovery } from '../../components/connection-recovery/ConnectionRecovery';

export function SpecVersions({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  return (
    <SpecVersionsLoader
      baseUrl={baseUrl}
      fallback={(retry) => (
        <ConnectionRecovery baseUrl={baseUrl} phase="connecting" onRetry={retry} />
      )}
      error={(_err, retry, ignore) => (
        <ConnectionRecovery
          baseUrl={baseUrl}
          phase="unreachable"
          onRetry={retry}
          onContinue={ignore}
        />
      )}
    >
      {(versions) => <SpecVersionsProvider value={versions}>{children}</SpecVersionsProvider>}
    </SpecVersionsLoader>
  );
}
