import Foundation

public struct Entrypoint: Codable, Sendable { public let name: String; public let path: String; public let allowedSources: [String]; public let allowedInputKeys: [String] }
public struct CrossLink: Codable, Identifiable, Sendable { public let id: String; public let label: String; public let targetAppId: String; public let targetEntrypoint: String; public let allowedInputKeys: [String] }
public struct AppManifest: Codable, Identifiable, Sendable {
    public let id: String; public let name: String; public let shortName: String; public let routes: [String]; public let rootRoute: String
    public let resourceEndpoint: String; public let publicEntrypoints: [Entrypoint]; public let crossAppLinks: [CrossLink]
}
public struct Tenant: Codable, Identifiable, Sendable { public let id: String; public let label: String; public let description: String; public let featuredAppIds: [String]; public let accent: String; public let centre: Centre }
public struct Centre: Codable, Sendable { public let lat: Double; public let lon: Double }
public struct Category: Codable, Identifiable, Sendable { public let id: String; public let name: String; public let description: String; public let miniAppIds: [String]; public let audience: String }
public struct Benefit: Codable, Sendable { public let title: String; public let detail: String; public let type: String }
public struct BankCard: Codable, Identifiable, Sendable {
    public let id: String; public let bankName: String; public let bankCode: String; public let cardName: String; public let cardBrand: String
    public let annualFeeVnd: Int; public let firstYearFree: Bool; public let imageColor: String; public let benefits: [Benefit]
    public var searchable: String { TextSearch.fold(([bankName, cardName] + benefits.flatMap { [$0.title, $0.detail] }).joined(separator: " ")) }
    public var headline: Benefit? { let rank = ["cashback", "discount", "interest_free", "lounge", "other"]; return benefits.min { (rank.firstIndex(of: $0.type) ?? 4) < (rank.firstIndex(of: $1.type) ?? 4) } }
}
public enum TextSearch {
    public static func fold(_ text: String) -> String { text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "vi_VN")).replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d").lowercased() }
    public static func matches(_ text: String, query: String) -> Bool { let value = fold(text); return fold(query).split(whereSeparator: { $0.isWhitespace }).allSatisfy { value.contains($0) } }
}
public struct Participant: Codable, Equatable, Identifiable, Sendable { public let id: String; public let displayName: String; public init(id: String, displayName: String) { self.id = id; self.displayName = displayName } }
public struct Slot: Codable, Identifiable, Sendable {
    public let id: String; public let dateId: String; public let courtId: String; public let courtName: String; public let venue: String
    public let startTime: String; public let endTime: String; public let priceVnd: Int; public let capacity: Int
    public var owner: String?; public var visibility: String; public var participants: [Participant]
    public var includesMe: Bool { participants.contains { $0.id == "me" } }
    public mutating func book(open: Bool) { guard owner == nil else { return }; owner = "me"; visibility = open ? "open" : "private"; participants = [Participant(id: "me", displayName: "Bạn")] }
    public mutating func join() { guard owner == "other", visibility == "open", participants.count < capacity, !includesMe else { return }; participants.append(Participant(id: "me", displayName: "Bạn")) }
    public mutating func cancel() { guard owner == "me" else { return }; owner = nil; visibility = "private"; participants = [] }
    public mutating func remove(_ id: String) { guard owner == "me", id != "me" else { return }; participants.removeAll { $0.id == id } }
    public func interval(now: Date = Date(), calendar: Calendar = .current) -> DateInterval? {
        func clock(_ text: String) -> (Int, Int)? { let parts = text.split(separator: ":"); guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]), (0...23).contains(h), (0...59).contains(m) else { return nil }; return (h, m) }
        guard let s = clock(startTime), let e = clock(endTime) else { return nil }
        var day = now
        if dateId == "tomorrow" { day = calendar.date(byAdding: .day, value: 1, to: now)! }
        if dateId == "weekend" { var delta = (7 - calendar.component(.weekday, from: now) + 7) % 7; if delta == 0, let today = calendar.date(bySettingHour: s.0, minute: s.1, second: 0, of: now), today <= now { delta = 7 }; day = calendar.date(byAdding: .day, value: delta, to: now)! }
        guard let start = calendar.date(bySettingHour: s.0, minute: s.1, second: 0, of: day), var end = calendar.date(bySettingHour: e.0, minute: e.1, second: 0, of: day) else { return nil }
        if end <= start { end = calendar.date(byAdding: .day, value: 1, to: end)! }; return DateInterval(start: start, end: end)
    }
}
public struct Capability: Codable, Sendable {
    public let name: String; public let version: Int; public let risk: String; public let consent: String; public let min_tier: String; public let payload_cap: Int; public let quota: Quota
    public struct Quota: Codable, Sendable { public let sustained: Int; public let burst: Int }
}
public struct Catalog: Codable, Sendable {
    public let schemaVersion: Int; public let config: RuntimeConfig; public let hostEvents: [String: EventDeclaration]; public let apps: [AppManifest]; public let tenants: [Tenant]; public let categories: [Category]; public let cards: [BankCard]; public let slots: [Slot]; public let capabilities: [Capability]
    public static func load(_ data: Data) throws -> Catalog { guard data.count < 2_000_000 else { throw CocoaError(.fileReadCorruptFile) }; let value = try JSONDecoder().decode(Catalog.self, from: data); guard value.schemaVersion == 1, Set(value.apps.map(\.id)).count == value.apps.count, value.tenants.contains(where: { $0.id == "vn-fallback" }) else { throw CocoaError(.fileReadCorruptFile) }; return value }
    public func app(_ id: String) -> AppManifest? { apps.first { $0.id == id } }
    public func tenant(_ id: String) -> Tenant { tenants.first { $0.id == id } ?? tenants.first { $0.id == "vn-fallback" }! }
    public func resolve(latitude: Double, longitude: Double) -> String {
        guard latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else { return "vn-fallback" }
        func distance(_ c: Centre) -> Double { let rad = Double.pi / 180; let a = pow(sin((c.lat - latitude) * rad / 2), 2) + cos(latitude * rad) * cos(c.lat * rad) * pow(sin((c.lon - longitude) * rad / 2), 2); return 6371 * 2 * asin(sqrt(min(1, a))) }
        let closest = tenants.filter { $0.id != "vn-fallback" }.min { distance($0.centre) < distance($1.centre) }
        return closest.map { distance($0.centre) <= 350 ? $0.id : "vn-fallback" } ?? "vn-fallback"
    }
}
public struct Preferences: Codable, Sendable {
    public var customized = false; public var categories: [String] = []; public var apps: [String] = []; public var dock: [String] = ["", ""]
    public init() {}
    public mutating func normalize(catalog: Catalog, tenant: String) {
        let available = Set(catalog.tenant(tenant).featuredAppIds)
        apps = Array(NSOrderedSet(array: apps.filter { available.contains($0) }).array as? [String] ?? []).prefix(24).map { $0 }
        categories = Array(NSOrderedSet(array: categories.filter { id in catalog.categories.contains { $0.id == id } }).array as? [String] ?? []).prefix(24).map { $0 }
        dock = (0..<2).map { index in index < dock.count && available.contains(dock[index]) ? dock[index] : "" }
        if dock[0] == dock[1] { dock[1] = "" }
    }
}
public struct InboxItem: Codable, Identifiable, Sendable {
    public let id: String; public let title: String; public let body: String; public let createdAt: Date; public let expiresAt: Date?; public let appId: String?; public let entrypoint: String?; public let input: [String: String]; public var seen: Bool
    public init(id: String, title: String, body: String, createdAt: Date = Date(), expiresAt: Date? = nil, appId: String? = nil, entrypoint: String? = nil, input: [String: String] = [:], seen: Bool = false) { self.id = id; self.title = title; self.body = body; self.createdAt = createdAt; self.expiresAt = expiresAt; self.appId = appId; self.entrypoint = entrypoint; self.input = input; self.seen = seen }
}
public struct Snapshot: Codable, Sendable {
    public var version = 1; public var tenantId = "vn-fallback"; public var preferences: [String: Preferences] = [:]; public var inbox: [String: [InboxItem]] = [:]
    public init() {}
    public mutating func normalize(catalog: Catalog) { tenantId = catalog.tenant(tenantId).id; for key in preferences.keys { preferences[key]?.normalize(catalog: catalog, tenant: key) }; for key in inbox.keys { inbox[key] = Array(inbox[key, default: []].prefix(catalog.config.notification.maxInboxItems)) } }
}

public struct EventDeclaration: Codable, Sendable { public let version: Int; public let priority: String; public let privacyClass: String; public let allowedDataKeys: [String] }
public struct RuntimeConfig: Codable, Sendable {
    public let notification: NotificationConfig; public let tracking: TrackingConfig
    public struct NotificationConfig: Codable, Sendable { public let maxInboxItems: Int; public let reminderLeadMs: Int }
    public struct TrackingConfig: Codable, Sendable { public let sessionRenewMs: Int; public let maxEventBytes: Int; public let maxQueueBytes: Int; public let retentionMs: [String: Int]; public let hostAppVersion: String; public let consentVersion: Int }
}

public enum EventIdentity {
    public static func uuidV7(milliseconds: UInt64 = UInt64(Date().timeIntervalSince1970 * 1000)) -> String {
        let uuid = UUID().uuid
        var bytes = withUnsafeBytes(of: uuid) { Array($0) }
        for i in 0..<6 { bytes[5 - i] = UInt8(truncatingIfNeeded: milliseconds >> (8 * i)) }
        bytes[6] = (bytes[6] & 15) | 112; bytes[8] = (bytes[8] & 63) | 128
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let parts = [0..<8, 8..<12, 12..<16, 16..<20, 20..<32].map { range in String(hex.dropFirst(range.lowerBound).prefix(range.count)) }
        return parts.joined(separator: "-")
    }
}
