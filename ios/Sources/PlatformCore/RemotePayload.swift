import Foundation
public enum RemotePayload {
    public static func parse(_ data: Data, now: Date = Date()) -> InboxItem? {
        guard data.count <= 4096, let base = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let root = base.merging(base["data"] as? [String: Any] ?? [:]) { _, new in new }
        func text(_ value: Any?, max: Int) -> String? { guard let value = value as? String, !value.isEmpty, value.count <= max else { return nil }; return value }
        func timestamp(_ value: Any?) -> Date? { if let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite, number.doubleValue > 0 { return Date(timeIntervalSince1970: number.doubleValue / 1000) }; if let string = value as? String { if let number = Double(string), number.isFinite, number > 0 { return Date(timeIntervalSince1970: number / 1000) }; let formatter = ISO8601DateFormatter(); if let date = formatter.date(from: string) { return date }; formatter.formatOptions.insert(.withFractionalSeconds); return formatter.date(from: string) }; return nil }
        func identifier(_ value: String) -> Bool { value.range(of: "^[A-Za-z0-9._:-]{1,160}$", options: .regularExpression) != nil }
        let alert = (root["aps"] as? [String: Any])?["alert"] as? [String: Any]
        guard let id = text(root["notification_id"], max: 160), identifier(id), let category = text(root["category"], max: 80), identifier(category), let title = text(root["title"], max: 180) ?? text(alert?["title"], max: 180), let body = text(root["body"], max: 600) ?? text(alert?["body"], max: 600), let created = timestamp(root["created_at_ms"] ?? root["created_at"]) else { return nil }
        let rawExpiry = root["expires_at_ms"] ?? root["expires_at"]; let expires = timestamp(rawExpiry); guard rawExpiry == nil || expires != nil else { return nil }; guard expires.map({ $0 > now }) ?? true else { return nil }
        let app = text(root["target_app_id"], max: 100); let entry = text(root["entrypoint_id"], max: 100); guard (app == nil) == (entry == nil) else { return nil }
        var rawInput = root["target_input"] ?? root["input"]
        if let encoded = rawInput as? String { guard let bytes = encoded.data(using: .utf8), let decoded = try? JSONSerialization.jsonObject(with: bytes) else { return nil }; rawInput = decoded }
        guard rawInput == nil || rawInput is [String: String] else { return nil }
        let input = rawInput as? [String: String] ?? [:]
        guard (try? JSONSerialization.data(withJSONObject: input).count).map({ $0 <= 4096 }) ?? false else { return nil }
        return InboxItem(id: id, title: title, body: body, createdAt: created, expiresAt: expires, appId: app, entrypoint: entry, input: input)
    }
}
import CoreFoundation
