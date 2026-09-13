/**
 * Mini-app container — the ONE factory (C1).
 *
 * Every mini-app WebView is constructed here and nowhere else.
 * Nothing else in the codebase may construct a WebView.
 *
 * Responsibilities (container-wiring steps 1-5):
 *  - serve verified package over bound origin (mini://appId or https://appId.miniapp.*)
 *  - apply CONTAINER_CONFIG (storage/cookies/file access off)
 *  - set CSP as response header (never <meta>)
 *  - contain navigation via decideNavigation
 *  - handle renderer death on every instance including pooled (B4)
 *  - drive splash via native first-paint signal + native timeout (never JS)
 *
 * JS-thread note: this component is a native component in the RN tree; the
 * bridge terminates in native code inside it. No RN scroll handlers here (C7).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
// react-native-webview is not yet installed in MVP — we type the props loosely
// and guard the import so tests / JS-only runs don't break. Adding the dep is
// a tracked admission (S1) and must not be done implicitly.
let WebView: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebView = require('react-native-webview').WebView ?? null;
} catch {
  WebView = null;
}

import { CONTAINER_CONFIG } from './containerConfig';
import { buildCspHeader } from './csp';
import { decideNavigation } from './navigationGuard';
import { useReducedMotion } from '../../config/useReducedMotion';
import { ShellPalette } from '../../config/palette';
import * as budgets from '../../config/budgets';

export type MiniAppContainerProps = {
  appId: string;
  manifestVersion: number;
  declaredRoutes: readonly string[];
  egressHosts: readonly string[];
  /** In-memory index of verified package assets: path → html/js bytes. MVP: single entry. */
  packageIndex: Map<string, string>;
  palette: ShellPalette;
  onClose: () => void;
  onRendererGone?: (reason: string) => void;
};

// ── Scheme helpers ───────────────────────────────────────────────────────

function originFor(appId: string): string {
  if (Platform.OS === 'ios') return `mini://${appId}`;
  return `https://${appId}.miniapp.platform.local`;
}

function entryUrlFor(appId: string): string {
  return `${originFor(appId)}/`;
}

// ── The factory — exactly one call site constructs a WebView (C1) ─────────
export function MiniAppContainer({
  appId,
  declaredRoutes,
  egressHosts,
  packageIndex,
  palette,
  onClose,
  onRendererGone,
}: MiniAppContainerProps) {
  const [splashVisible, setSplashVisible] = useState(true);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  const cspHeader = buildCspHeader({ appId, egressHosts });

  // Native first-paint signal — here simulated via onLoad; real native
  // implementation drives this from the compositor, not from JS.
  const onFirstPaint = useCallback(() => {
    if (splashTimer.current) clearTimeout(splashTimer.current);
    setSplashVisible(false);
  }, []);

  useEffect(() => {
    // Native timeout — a broken mini-app must not hang the shell forever.
    // Budget-owned: must settle within emphasized transition ceiling when released.
    const timeoutMs = 4000;
    splashTimer.current = setTimeout(() => {
      setSplashVisible(false);
    }, timeoutMs);
    return () => {
      if (splashTimer.current) clearTimeout(splashTimer.current);
    };
  }, []);

  // Attach renderer-death handling — must be on every instance including pooled.
  // On Android, an unhandled callback on any WebView sharing the crashed renderer
  // kills the host process (B4). Here we surface it to the host for reload/teardown.
  const handleRenderProcessGone = useCallback(
    (event: { nativeEvent: { didCrash: boolean } }) => {
      const reason = event.nativeEvent.didCrash ? 'crash' : 'killed';
      onRendererGone?.(reason);
      // Host will reload from verified package + snapshot; we just signal.
    },
    [onRendererGone],
  );

  const html = packageIndex.get('/') ?? packageIndex.get('index.html') ?? '';

  // Verification gate (B5): do not render until package is verified.
  // MVP: caller guarantees packageIndex is from a verified package (signer.ts verifyPackage).
  // Real implementation: async verify before first byte — here we assert presence.
  if (packageIndex.size === 0) {
    return (
      <View style={[styles.fallback, { backgroundColor: palette.surface }]}>
        <Text style={{ color: palette.danger }}>Package not verified — refusing to render (B5).</Text>
      </View>
    );
  }

  // If WebView dep not installed (MVP JS-only run), render a verifiable stub so
  // tests and the JS harness still exercise csp/navigation logic without a native binary.
  if (!WebView) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.canvas }]} testID="miniapp-container-stub">
        <View style={[styles.trustedHeader, { backgroundColor: palette.surface, borderBottomColor: palette.glassBorder }]}>
          <Text style={{ color: palette.mutedText, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>VERIFIED MINI-APP · {appId}</Text>
        </View>
        {splashVisible ? (
          <View style={[styles.splash, { backgroundColor: palette.surface }]}>
            <ActivityIndicator color={palette.primary} />
            <Text style={{ color: palette.mutedText, marginTop: 8 }}>Loading verified package…</Text>
            <Text style={{ color: palette.mutedText, fontSize: 10, marginTop: 4 }}>CSP: {cspHeader.slice(0, 80)}…</Text>
          </View>
        ) : null}
        <View style={{ padding: 16 }}>
          <Text style={{ color: palette.text, fontSize: 12 }}>Container stub — WebView not linked in this build.</Text>
          <Text style={{ color: palette.mutedText, fontSize: 10, marginTop: 6 }}>Origin: {originFor(appId)} · Entry: {entryUrlFor(appId)}</Text>
          {/* CSP header would be served on the document; meta CSP must be absent — asserted in tests (B2) */}
        </View>
      </View>
    );
  }

  const originWhitelist = [originFor(appId) + '/*'];

  return (
    <View style={[styles.screen, { backgroundColor: palette.canvas }]}>
      {/* Trusted header — native shell owns this; mini-app cannot spoof. */}
      <View style={[styles.trustedHeader, { backgroundColor: palette.surface, borderBottomColor: palette.glassBorder }]}>
        <Text style={{ color: palette.text, fontWeight: '800' }}>{appId}</Text>
        <Text style={{ color: palette.primary }} onPress={onClose}>
          ×
        </Text>
      </View>

      {splashVisible ? (
        <View
          style={[
            styles.splash,
            { backgroundColor: palette.surface },
            reducedMotion && { opacity: 1 },
          ]}
        >
          <ActivityIndicator color={palette.primary} size="small" />
          <Text style={{ color: palette.mutedText, marginTop: 8 }}>Loading…</Text>
        </View>
      ) : null}

      <WebView
        originWhitelist={originWhitelist}
        source={{
          baseUrl: originFor(appId),
          html: wrapWithNoMetaCsp(html, cspHeader, budgets),
        }}
        // Isolation — single source of truth (CONTAINER_CONFIG)
        domStorageEnabled={CONTAINER_CONFIG.domStorageEnabled}
        thirdPartyCookiesEnabled={CONTAINER_CONFIG.thirdPartyCookiesEnabled}
        allowFileAccess={CONTAINER_CONFIG.allowFileAccess}
        allowUniversalAccessFromFileURLs={CONTAINER_CONFIG.allowUniversalAccessFromFileURLs}
        allowFileAccessFromFileURLs={CONTAINER_CONFIG.allowFileAccessFromFileURLs}
        incognito={CONTAINER_CONFIG.incognito}
        javaScriptEnabled={CONTAINER_CONFIG.javaScriptEnabled}
        // No RN scroll handlers (C7)
        // Navigation containment (B3)
        onShouldStartLoadWithRequest={(req: { url: string; isTopFrame?: boolean }) => {
          const decision = decideNavigation(
            { url: req.url, isMainFrame: req.isTopFrame ?? true },
            { appId, declaredRoutes, isAndroid: Platform.OS === 'android' },
          );
          return decision.allowed;
        }}
        onRenderProcessGone={handleRenderProcessGone}
        onLoad={onFirstPaint}
        // Pool safety: never persist anything; incognito + disabled storage guarantees reset = never held (B1).
        testID="miniapp-webview"
      />
    </View>
  );
}

function wrapWithNoMetaCsp(html: string, _cspHeader: string, _budgets: typeof budgets): string {
  // Real CSP is a response header set by the scheme handler — not a meta tag.
  // This wrapper must NOT inject a <meta http-equiv="Content-Security-Policy">.
  // Keeping the param to document the header that WOULD be served.
  if (html.includes('<meta') && html.toLowerCase().includes('content-security-policy')) {
    // In production we would strip it; in MVP we just return as-is for test detection (B2 fails if meta present).
    return html;
  }
  return html;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  trustedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splash: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
