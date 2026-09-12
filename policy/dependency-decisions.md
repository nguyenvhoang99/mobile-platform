# Dependency decisions

## Firebase Cloud Messaging for Android — 2026-08-06

**Proposed by / for:** The host-owned remote-notification pipeline needs an Android push
transport that can receive messages while the application process is not active.

**What carrying it costs:** Firebase Messaging adds a native SDK and Google Services build
plugin, so it participates in Android build compatibility and future React Native/Gradle
upgrades. It is isolated behind the host notification module and is not exposed to
mini-apps.

**Decision:** Admitted. Android does not provide an application-facing push transport that
can replace a provider SDK; implementing a custom persistent connection would be less
reliable, less battery-efficient, and substantially more code to maintain.

**What we did instead of adding a cross-platform wrapper:** iOS uses the platform APNs APIs
directly. Android depends only on the Firebase Messaging artifact, not Analytics or a React
Native Firebase wrapper. The Google Services plugin is applied only when a project-owned
`google-services.json` exists.

**Revisit when:** Firebase Messaging loses support for the project's Android toolchain, the
backend selects a different Android push provider, or Android exposes an equivalent system
transport without a provider SDK.
