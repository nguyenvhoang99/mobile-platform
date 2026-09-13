import {
  MiniAppManifest,
  MiniAppLink,
  miniAppCatalog,
} from '../miniapps/catalog';

export type DockSlot = 'left' | 'right';

export type DockSelection = Record<DockSlot, string | null>;

export type ShellDestination = 'explore' | 'account';

export type MiniAppFrame = {
  appId: string;
  sessionId: string;
  entrypoint: string;
  history: string[];
  input: Record<string, unknown>;
};

export type NavigationState = {
  shell: ShellDestination;
  miniApps: MiniAppFrame[];
};

export type NavigationResult =
  | { ok: true; state: NavigationState }
  | {
      ok: false;
      state: NavigationState;
      error:
        | 'APP_NOT_FOUND'
        | 'ROUTE_NOT_DECLARED'
        | 'LINK_NOT_GRANTED'
        | 'ENTRYPOINT_NOT_EXPOSED'
        | 'SOURCE_NOT_ALLOWED'
        | 'INVALID_INPUT';
    };

const initialState: NavigationState = {
  shell: 'explore',
  miniApps: [],
};

function createMiniAppSessionId(appId: string): string {
  return `${appId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createNavigationState(): NavigationState {
  return initialState;
}

function routeSegments(path: string): string[] | null {
  if (
    !path.startsWith('/') ||
    path.includes('://') ||
    path.includes('\\') ||
    path.length > 512
  ) {
    return null;
  }

  const pathname = path.split(/[?#]/, 1)[0];
  const segments = pathname.split('/').filter(Boolean);
  try {
    if (
      segments.some(segment => {
        const decoded = decodeURIComponent(segment);
        return decoded === '.' || decoded === '..';
      })
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return segments;
}

export function isDeclaredRoute(
  manifest: MiniAppManifest,
  path: string,
): boolean {
  const candidate = routeSegments(path);
  if (!candidate) {
    return false;
  }

  return manifest.routes.some(pattern => {
    const declared = routeSegments(pattern);
    return (
      declared !== null &&
      declared.length === candidate.length &&
      declared.every(
        (segment, index) =>
          segment.startsWith(':') || segment === candidate[index],
      )
    );
  });
}

function findManifest(appId: string): MiniAppManifest | undefined {
  return miniAppCatalog.find(app => app.id === appId);
}

export function openDockMiniApp(
  state: NavigationState,
  appId: string,
): NavigationResult {
  const manifest = findManifest(appId);
  if (!manifest) {
    return { ok: false, state, error: 'APP_NOT_FOUND' };
  }

  const existingIndex = state.miniApps.findIndex(
    frame => frame.appId === appId,
  );
  if (existingIndex >= 0) {
    return {
      ok: true,
      state: {
        ...state,
        miniApps: state.miniApps.slice(0, existingIndex + 1),
      },
    };
  }

  return {
    ok: true,
    state: {
      shell: 'explore',
      miniApps: [
        ...state.miniApps,
        {
          appId,
          sessionId: createMiniAppSessionId(appId),
          entrypoint: 'root',
          history: [manifest.rootRoute],
          input: {},
        },
      ],
    },
  };
}

export function navigateInsideMiniApp(
  state: NavigationState,
  path: string,
): NavigationResult {
  const frame = state.miniApps.at(-1);
  if (!frame) {
    return { ok: false, state, error: 'APP_NOT_FOUND' };
  }
  const manifest = findManifest(frame.appId);
  if (!manifest || !isDeclaredRoute(manifest, path)) {
    return { ok: false, state, error: 'ROUTE_NOT_DECLARED' };
  }

  const frames = [...state.miniApps];
  frames[frames.length - 1] = {
    ...frame,
    history: [...frame.history, path],
  };
  return { ok: true, state: { ...state, miniApps: frames } };
}

function validLinkInput(link: MiniAppLink, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  return (
    keys.every(key => link.allowedInputKeys.includes(key)) &&
    JSON.stringify(input).length <= 4096
  );
}

function validEntrypointInput(
  allowedInputKeys: readonly string[],
  input: Record<string, unknown>,
): boolean {
  try {
    return (
      Object.keys(input).every(key => allowedInputKeys.includes(key)) &&
      JSON.stringify(input).length <= 4096
    );
  } catch {
    return false;
  }
}

export function openNotificationMiniApp(
  state: NavigationState,
  appId: string,
  entrypointId: string,
  input: Record<string, unknown>,
): NavigationResult {
  const target = findManifest(appId);
  if (!target) {
    return { ok: false, state, error: 'APP_NOT_FOUND' };
  }
  const entrypoint = target.publicEntrypoints.find(
    item => item.name === entrypointId,
  );
  if (!entrypoint) {
    return { ok: false, state, error: 'ENTRYPOINT_NOT_EXPOSED' };
  }
  if (!entrypoint.allowedSources.includes('host_notification')) {
    return { ok: false, state, error: 'SOURCE_NOT_ALLOWED' };
  }
  if (!validEntrypointInput(entrypoint.allowedInputKeys, input)) {
    return { ok: false, state, error: 'INVALID_INPUT' };
  }
  if (!isDeclaredRoute(target, entrypoint.path)) {
    return { ok: false, state, error: 'ROUTE_NOT_DECLARED' };
  }

  const existingIndex = state.miniApps.findIndex(
    frame => frame.appId === target.id,
  );
  const targetFrame: MiniAppFrame = {
    appId: target.id,
    sessionId: createMiniAppSessionId(target.id),
    entrypoint: entrypoint.name,
    history: [entrypoint.path],
    input,
  };
  return {
    ok: true,
    state: {
      shell: 'explore',
      miniApps:
        existingIndex >= 0
          ? [...state.miniApps.slice(0, existingIndex), targetFrame]
          : [...state.miniApps, targetFrame],
    },
  };
}

export function openCrossMiniApp(
  state: NavigationState,
  linkId: string,
  input: Record<string, unknown>,
): NavigationResult {
  const sourceFrame = state.miniApps.at(-1);
  const source = sourceFrame ? findManifest(sourceFrame.appId) : undefined;
  if (!sourceFrame || !source) {
    return { ok: false, state, error: 'APP_NOT_FOUND' };
  }

  const link = source.crossAppLinks.find(item => item.id === linkId);
  if (!link) {
    return { ok: false, state, error: 'LINK_NOT_GRANTED' };
  }
  if (!validLinkInput(link, input)) {
    return { ok: false, state, error: 'INVALID_INPUT' };
  }

  const target = findManifest(link.targetAppId);
  if (!target) {
    return { ok: false, state, error: 'APP_NOT_FOUND' };
  }
  const entrypoint = target.publicEntrypoints.find(
    item => item.name === link.targetEntrypoint,
  );
  if (!entrypoint) {
    return { ok: false, state, error: 'ENTRYPOINT_NOT_EXPOSED' };
  }
  if (!entrypoint.allowedSources.includes(source.id)) {
    return { ok: false, state, error: 'SOURCE_NOT_ALLOWED' };
  }

  const existingIndex = state.miniApps.findIndex(
    frame => frame.appId === target.id,
  );
  const targetFrame: MiniAppFrame = {
    appId: target.id,
    sessionId: createMiniAppSessionId(target.id),
    entrypoint: entrypoint.name,
    history: [entrypoint.path],
    input,
  };

  return {
    ok: true,
    state: {
      shell: 'explore',
      miniApps:
        existingIndex >= 0
          ? [...state.miniApps.slice(0, existingIndex), targetFrame]
          : [...state.miniApps, targetFrame],
    },
  };
}

export function goBack(state: NavigationState): NavigationState {
  const frame = state.miniApps.at(-1);
  if (!frame) {
    return state.shell === 'account' ? initialState : state;
  }

  if (frame.history.length > 1) {
    const frames = [...state.miniApps];
    frames[frames.length - 1] = {
      ...frame,
      history: frame.history.slice(0, -1),
    };
    return { ...state, miniApps: frames };
  }

  return { ...state, miniApps: state.miniApps.slice(0, -1) };
}

export function showShell(
  state: NavigationState,
  destination: ShellDestination,
): NavigationState {
  return { ...state, shell: destination, miniApps: [] };
}

export function closeMiniApps(state: NavigationState): NavigationState {
  return { ...state, shell: 'explore', miniApps: [] };
}
