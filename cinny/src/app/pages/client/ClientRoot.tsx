import { Box, Spinner, Text } from 'folds';
import { HttpApiEvent, HttpApiEventHandlerMap, MatrixClient } from 'matrix-js-sdk';
import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { initClient, startClient } from '../../../client/initMatrix';
import { SplashScreen } from '../../components/splash-screen';
import { ServerConfigsLoader } from '../../components/ServerConfigsLoader';
import {
  ConnectionRecovery,
  ConnectionsButton,
} from '../../components/connection-recovery/ConnectionRecovery';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import { MediaConfigProvider } from '../../hooks/useMediaConfig';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { SpecVersions } from './SpecVersions';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useSyncState } from '../../hooks/useSyncState';
import { SyncStatus } from './SyncStatus';
import { AuthMetadataProvider } from '../../hooks/useAuthMetadata';
import { getFallbackSession } from '../../state/sessions';
import { AutoDiscovery } from './AutoDiscovery';

function ClientRootLoading() {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text>Anmeldung wird vorbereitet …</Text>
        <ConnectionsButton />
      </Box>
    </SplashScreen>
  );
}

const useLogoutListener = (mx?: MatrixClient) => {
  useEffect(() => {
    const handleLogout: HttpApiEventHandlerMap[HttpApiEvent.SessionLoggedOut] = async () => {
      mx?.stopClient();
      await mx?.clearStores();
      window.localStorage.clear();
      window.location.reload();
    };
    mx?.on(HttpApiEvent.SessionLoggedOut, handleLogout);
    return () => {
      mx?.removeListener(HttpApiEvent.SessionLoggedOut, handleLogout);
    };
  }, [mx]);
};

export function ClientRoot({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [syncState, setSyncState] = useState<string | null>(null);
  const { baseUrl, userId } = getFallbackSession() ?? {};
  const [loadState, loadMatrix] = useAsyncCallback<MatrixClient, Error, []>(
    useCallback(() => {
      const session = getFallbackSession();
      if (!session) throw new Error('No session Found!');
      return initClient(session);
    }, [])
  );
  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;
  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback((m) => startClient(m), [])
  );
  useLogoutListener(mx);
  useEffect(() => {
    if (loadState.status === AsyncStatus.Idle) loadMatrix().catch(() => {});
  }, [loadState, loadMatrix]);
  useEffect(() => {
    if (mx && !mx.clientRunning) startMatrix(mx).catch(() => {});
  }, [mx, startMatrix]);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useSyncState(
    mx,
    useCallback((state) => {
      setSyncState(state);
      if (state === 'PREPARED' || state === 'SYNCING') setLoading(false);
    }, [])
  );
  const retry = () => {
    mx?.stopClient();
    window.location.reload();
  };
  const failed = loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error;
  const disconnected = syncState === 'ERROR' || syncState === 'RECONNECTING';

  return (
    <AutoDiscovery userId={userId!} baseUrl={baseUrl!}>
      <SpecVersions baseUrl={baseUrl!}>
        {mx && !loading && <SyncStatus mx={mx} />}
        {failed ? (
          <ConnectionRecovery baseUrl={baseUrl!} phase="error" onRetry={retry} />
        ) : loading || !mx ? (
          slow || disconnected ? (
            <ConnectionRecovery
              baseUrl={baseUrl!}
              phase={disconnected ? 'unreachable' : mx ? 'syncing' : 'initializing'}
              onRetry={retry}
            />
          ) : (
            <ClientRootLoading />
          )
        ) : (
          <MatrixClientProvider value={mx}>
            <ServerConfigsLoader>
              {(serverConfigs) => (
                <CapabilitiesProvider value={serverConfigs.capabilities ?? {}}>
                  <MediaConfigProvider value={serverConfigs.mediaConfig ?? {}}>
                    <AuthMetadataProvider value={serverConfigs.authMetadata}>
                      {children}
                    </AuthMetadataProvider>
                  </MediaConfigProvider>
                </CapabilitiesProvider>
              )}
            </ServerConfigsLoader>
          </MatrixClientProvider>
        )}
      </SpecVersions>
    </AutoDiscovery>
  );
}
