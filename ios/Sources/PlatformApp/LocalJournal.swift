import Foundation
import PlatformCore

// Local queue only. A signed endpoint and reviewed transport are required before upload.
actor LocalJournal {
    private let catalog: Catalog
    private let directory: URL
    private var queues: [String: [[String: Any]]] = [:]
    private var blocked: Set<String> = []
    private var session = EventIdentity.uuidV7()
    private var lastActive = Date().timeIntervalSince1970 * 1000
    private var index = 0
    init(catalog: Catalog) { self.catalog = catalog; directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("native-telemetry", isDirectory: true) }
    func record(_ name: String, tenant: String, data: [String: String] = [:]) {
        guard catalog.tenants.contains(where: { $0.id == tenant }), let declaration = catalog.hostEvents[name], Set(data.keys).isSubset(of: Set(declaration.allowedDataKeys)), data.values.allSatisfy({ $0.utf8.count <= 512 }), !blocked.contains("host") else { return }
        let scope = "host"; let file = directory.appendingPathComponent("host.json")
        if queues[scope] == nil {
            do { if FileManager.default.fileExists(atPath: file.path) { let size = try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber; guard (size?.intValue ?? Int.max) <= catalog.config.tracking.maxQueueBytes else { throw CocoaError(.fileReadCorruptFile) }; let bytes = try Data(contentsOf: file); guard bytes.count <= catalog.config.tracking.maxQueueBytes, let rows = try JSONSerialization.jsonObject(with: bytes) as? [[String: Any]] else { throw CocoaError(.fileReadCorruptFile) }; queues[scope] = rows } else { queues[scope] = [] } }
            catch { blocked.insert(scope); return } // Preserve corrupt bytes rather than silently overwriting.
        }
        let config = catalog.config.tracking; let now = Date().timeIntervalSince1970 * 1000
        if now - lastActive > Double(config.sessionRenewMs) { session = EventIdentity.uuidV7(); index = 0 }; lastActive = now
        var queue = queues[scope, default: []].filter { item in guard let at = item["occurred_at_ms"] as? Double, let priority = item["priority"] as? String, let ttl = config.retentionMs[priority] else { return false }; return now - at <= Double(ttl) }
        let sequence = (queues[scope, default: []].compactMap { $0["queue_sequence"] as? Int }.max() ?? -1) + 1
        let anonymous = queues[scope]?.first?["anonymous_id"] as? String ?? UUID().uuidString
        let event: [String: Any] = ["tenant_id": tenant, "event_id": "\(session):\(index)", "event_index": index, "queue_sequence": sequence, "event_name": name, "event_version": declaration.version, "event_data": data, "occurred_at_ms": now, "source_type": "native", "mini_app_id": NSNull(), "mini_app_version": NSNull(), "host_app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? config.hostAppVersion, "platform": "ios", "session_id": session, "mini_app_session_id": NSNull(), "user_id": NSNull(), "anonymous_id": anonymous, "priority": declaration.priority, "trace_id": NSNull(), "privacy_class": declaration.privacyClass, "consent_version": config.consentVersion, "sdk_version": 1, "network_at_event": "unknown", "attempt_count": 0]
        guard let bytes = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]), bytes.count <= config.maxEventBytes else { return }; index += 1; queue.append(event)
        let priorities = ["diagnostic", "product", "operational", "critical"]
        while ((try? JSONSerialization.data(withJSONObject: queue).count) ?? Int.max) > config.maxQueueBytes {
            guard let candidate = priorities.compactMap({ p in queue.firstIndex { ($0["priority"] as? String) == p } }).first else { return }; queue.remove(at: candidate)
        }
        do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true); try JSONSerialization.data(withJSONObject: queue, options: [.sortedKeys]).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]); queues[scope] = queue } catch { blocked.insert(scope) }
    }
}
