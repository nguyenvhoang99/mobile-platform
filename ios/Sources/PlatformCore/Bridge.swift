import Foundation
import CryptoKit
public enum BridgeCode: String, Codable, Error, Sendable {
    case notDeclared = "CAPABILITY_NOT_DECLARED", notGranted = "CAPABILITY_NOT_GRANTED", consentRequired = "CONSENT_REQUIRED", consentDenied = "CONSENT_DENIED", rateLimited = "RATE_LIMITED", invalid = "INVALID_ARGUMENT", revoked = "REVOKED", unavailable = "UNAVAILABLE"
}
public struct BridgeReply: Sendable { public let data: [String: String]?; public let error: BridgeCode?; public var ok: Bool { error == nil } }
public struct BridgeAudit: Sendable { public let capability: String; public let operation: String; public let error: BridgeCode?; public let argsDigest: String; public let previousHash: String; public let hash: String }
// Immutable scope plus a lock-protected revocation flag; shared across UI and broker actor.
public final class PreviewSession: @unchecked Sendable {
    let id: UUID; let tenant: String; let app: String; let user: String; let tier: String; let grants: Set<String>
    private let lock = NSLock(); private var invalidated = false
    fileprivate var revoked: Bool { lock.lock(); defer { lock.unlock() }; return invalidated }
    public func invalidate() { lock.lock(); invalidated = true; lock.unlock() }
    init(id: UUID, tenant: String, app: String, user: String, tier: String, grants: Set<String>) { self.id = id; self.tenant = tenant; self.app = app; self.user = user; self.tier = tier; self.grants = grants }
    public static func sample(tenant: String) -> PreviewSession { PreviewSession(id: UUID(), tenant: tenant, app: "sample", user: "local-preview-user", tier: "first_party", grants: ["storage.kv", "ai.extract_bill"]) }
}
public actor PreviewBroker {
    private let registry: [Capability]
    private var values: [String: [String: String]] = [:]
    private var buckets: [String: (Double, TimeInterval)] = [:]
    public private(set) var audit: [BridgeAudit] = []
    public init(registry: [Capability]) { self.registry = registry }
    public func revoke(_ session: PreviewSession) { session.invalidate() }
    public func call(session: PreviewSession, capability: String, operation: String, version: Int = 1, args: [String: String], consent: Bool = false, now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> BridgeReply {
        var result: [String: String] = [:]; var error: BridgeCode?
        let bytes = (try? JSONSerialization.data(withJSONObject: args, options: [.sortedKeys])) ?? Data()
        let scope = [session.tenant, session.app, session.user].joined(separator: "\u{1f}")
        if session.revoked { error = .revoked }
        else if !session.grants.contains(capability) { error = .notDeclared }
        else if let rule = registry.first(where: { $0.name == capability && $0.version == version }) {
            let tiers = ["sandbox", "self_serve", "partner_verified", "first_party"]
            if (tiers.firstIndex(of: session.tier) ?? 0) < (tiers.firstIndex(of: rule.min_tier) ?? 3) || (session.tier == "sandbox" && rule.risk != "low") { error = .notGranted }
            else if bytes.count > rule.payload_cap || args.keys.contains(where: { ["appId", "tenantId", "userId", "origin", "path", "token"].contains($0) }) { error = .invalid }
            else if capability == "storage.kv" && (!Set(args.keys).isSubset(of: ["key", "value"]) || !["get", "set", "delete", "keys"].contains(operation) || (operation != "keys" && (args["key", default: ""].isEmpty || args["key", default: ""].count > 128 || args["key", default: ""].contains(":"))) || (operation == "set" && args["value"] == nil)) { error = .invalid }
            else if capability == "ai.extract_bill" && (operation != "extract" || !Set(args.keys).isSubset(of: ["locale", "idempotencyKey", "hint"]) || args["locale"] != "vi" || args["idempotencyKey", default: ""].isEmpty || args["idempotencyKey", default: ""].count > 128 || args["hint", default: ""].count > 280) { error = .invalid }
            else if rule.consent != "none" && !consent { error = .consentRequired }
            else {
                let key = scope + capability
                let previous = buckets[key] ?? (Double(rule.quota.burst), now)
                let tokens = min(Double(rule.quota.burst), previous.0 + max(0, now - previous.1) * Double(rule.quota.sustained) / 60)
                buckets[key] = (max(0, tokens - 1), now)
                if tokens < 1 { error = .rateLimited }
                else if capability == "storage.kv" {
                    var bucket = values[scope, default: [:]]; let key = args["key", default: ""]
                    switch operation {
                    case "get": result = bucket[key].map { ["value": $0] } ?? [:]
                    case "set": if bucket[key] == nil && bucket.count >= 200 { error = .invalid } else { bucket[key] = args["value"]; result = ["ok": "true"] }
                    case "delete": bucket.removeValue(forKey: key); result = ["ok": "true"]
                    default: result = ["keys": bucket.keys.sorted().joined(separator: ",")]
                    }; values[scope] = bucket
                } else { error = .unavailable }
            }
        } else { error = .unavailable }
        func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
        let digest = hash(bytes); let previous = audit.last?.hash ?? ""
        let recordHash = hash(Data([previous, capability, operation, error?.rawValue ?? "SUCCESS", digest].joined(separator: "|").utf8))
        audit.append(BridgeAudit(capability: capability, operation: operation, error: error, argsDigest: digest, previousHash: previous, hash: recordHash))
        if audit.count > 200 { audit.removeFirst() }
        return BridgeReply(data: error == nil ? result : nil, error: error)
    }
}
