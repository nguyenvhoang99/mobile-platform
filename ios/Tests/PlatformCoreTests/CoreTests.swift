import XCTest
@testable import PlatformCore
final class CoreTests: XCTestCase {
    func fixture() throws -> Catalog { let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("native/shared/platform.json"); return try Catalog.load(Data(contentsOf: file)) }
    func testContentAndSearch() throws { let c = try fixture(); XCTAssertEqual(c.apps.count, 9); XCTAssertEqual(c.cards.count, 12); XCTAssertTrue(TextSearch.matches("Ưu đãi ăn uống", query: "uu dai uong")); XCTAssertFalse(TextSearch.matches("ăn uống", query: "uống sân")); XCTAssertEqual(c.resolve(latitude: 21.0285, longitude: 105.8542), "vn-hn"); XCTAssertEqual(c.resolve(latitude: .nan, longitude: 0), "vn-fallback") }
    func testRoutesAndCrossLinks() throws { let c = try fixture(); var n = Navigator(); XCTAssertTrue(n.open("weather", catalog: c, tenant: "vn-hn")); let m = c.app("weather")!; for path in ["https://evil.com", "//evil", "/%2e%2e", "/forecast/%2fsecret", "/unknown", "/forecast/%ZZ"] { XCTAssertFalse(Routes.allows(path, manifest: m), path) }; XCTAssertTrue(n.navigate("/forecast/tomorrow", catalog: c)); n.back(); XCTAssertEqual(n.frames.last?.path, "/"); XCTAssertTrue(n.cross("open_transit", catalog: c, tenant: "vn-hn")); XCTAssertEqual(n.frames.count, 2); n.back(); XCTAssertEqual(n.frames.last?.appId, "weather"); XCTAssertFalse(n.open("badminton", catalog: c, tenant: "vn-dn")) }
    func testNotificationBoundary() throws { let c = try fixture(); var n = Navigator(); XCTAssertFalse(n.notification(InboxItem(id: "x", title: "", body: "", appId: "weather", entrypoint: "forecast", input: ["token": "bad"]), catalog: c, tenant: "vn-hn")); XCTAssertFalse(n.notification(InboxItem(id: "x", title: "", body: "", expiresAt: .distantPast, appId: "weather", entrypoint: "forecast"), catalog: c, tenant: "vn-hn")); XCTAssertTrue(n.notification(InboxItem(id: "x", title: "", body: "", appId: "weather", entrypoint: "forecast", input: ["area": "current"]), catalog: c, tenant: "vn-hn")) }
    func testBookingOwnershipAndCapacity() throws { let c = try fixture(); var empty = c.slots[0]; empty.book(open: true); empty.book(open: false); XCTAssertEqual(empty.visibility, "open"); empty.remove("me"); XCTAssertTrue(empty.includesMe); empty.cancel(); XCTAssertNil(empty.owner); var full = c.slots[4]; full.join(); XCTAssertEqual(full.participants.count, 4); full.cancel(); XCTAssertEqual(full.owner, "other"); var open = c.slots[1]; open.join(); open.join(); XCTAssertEqual(open.participants.count, 3) }
    func testSnapshotRoundtripAndIsolation() throws { let c = try fixture(); var s = Snapshot(); var p = Preferences(); p.apps = ["weather", "weather", "evil"]; p.dock = ["weather", "weather"]; s.preferences["vn-hn"] = p; s.normalize(catalog: c); let decoded = try JSONDecoder().decode(Snapshot.self, from: JSONEncoder().encode(s)); XCTAssertEqual(decoded.preferences["vn-hn"]?.apps, ["weather"]); XCTAssertEqual(decoded.preferences["vn-hn"]?.dock, ["weather", ""]); XCTAssertNil(decoded.preferences["vn-hcm"]) }
    func testBridgeGatesQuotaRevokeAudit() async throws { let c = try fixture(); let broker = PreviewBroker(registry: c.capabilities); let a = PreviewSession.sample(tenant: "vn-hn"); let b = PreviewSession.sample(tenant: "vn-hcm"); let set = await broker.call(session: a, capability: "storage.kv", operation: "set", args: ["key": "x", "value": "synthetic"]); XCTAssertTrue(set.ok); let isolated = await broker.call(session: b, capability: "storage.kv", operation: "get", args: ["key": "x"]); XCTAssertNil(isolated.data?["value"]); let forged = await broker.call(session: a, capability: "storage.kv", operation: "get", args: ["key": "x", "appId": "b"]); XCTAssertEqual(forged.error, .invalid); let ai = await broker.call(session: a, capability: "ai.extract_bill", operation: "extract", args: ["locale": "vi", "idempotencyKey": "test"], consent: true); XCTAssertEqual(ai.error, .unavailable); var last: BridgeReply?; for _ in 0..<25 { last = await broker.call(session: a, capability: "storage.kv", operation: "get", args: ["key": "x"], now: 10) }; XCTAssertEqual(last?.error, .rateLimited); await broker.revoke(a); let revoked = await broker.call(session: a, capability: "storage.kv", operation: "get", args: ["key": "x"]); XCTAssertEqual(revoked.error, .revoked); let audit = await broker.audit; XCTAssertFalse(audit.last!.argsDigest.contains("synthetic")); XCTAssertEqual(audit.last!.previousHash, audit[audit.count - 2].hash) }
}
extension CoreTests {
    func testRemotePayloadRejectsMalformedExpiredAndHalfTarget() throws {
        let now = Date(timeIntervalSince1970: 100)
        let payload: [String: Any] = ["notification_id": "notice-1", "category": "demo", "title": "T", "body": "B", "created_at_ms": 90000, "target_app_id": "weather", "entrypoint_id": "forecast", "target_input": ["area": "current"]]
        func parse(_ value: [String: Any]) throws -> InboxItem? { RemotePayload.parse(try JSONSerialization.data(withJSONObject: value), now: now) }
        XCTAssertEqual(try parse(payload)?.appId, "weather")
        var fcm = payload; fcm["target_input"] = "{\"area\":\"current\"}"; XCTAssertEqual(try parse(fcm)?.input["area"], "current")
        var invalidExpiry = payload; invalidExpiry["expires_at_ms"] = "invalid"; XCTAssertNil(try parse(invalidExpiry))
        var half = payload; half.removeValue(forKey: "entrypoint_id"); XCTAssertNil(try parse(half))
        var expired = payload; expired["expires_at_ms"] = 99000; XCTAssertNil(try parse(expired))
        var wrong = payload; wrong["created_at_ms"] = true; XCTAssertNil(try parse(wrong))
        wrong = payload; wrong["target_input"] = ["area": ["path": "/secret"]]; XCTAssertNil(try parse(wrong))
        XCTAssertNil(RemotePayload.parse(Data(repeating: 32, count: 4097)))
    }
    func testUUIDv7UsesTimeVersionAndVariant() {
        let value = EventIdentity.uuidV7(milliseconds: 1_000_000)
        XCTAssertTrue(value.hasPrefix("0000000f-4240-7")); XCTAssertNotNil(UUID(uuidString: value)); XCTAssertNotEqual(value, EventIdentity.uuidV7(milliseconds: 1_000_000))
    }
    func testSynchronousSessionRevocation() async throws {
        let c = try fixture(); let broker = PreviewBroker(registry: c.capabilities); let s = PreviewSession.sample(tenant: "vn-hn")
        s.invalidate()
        let result = await broker.call(session: s, capability: "storage.kv", operation: "set", args: ["key": "late", "value": "synthetic"])
        XCTAssertEqual(result.error, .revoked)
        let fresh = PreviewSession.sample(tenant: "vn-hn"); let value = await broker.call(session: fresh, capability: "storage.kv", operation: "get", args: ["key": "late"])
        XCTAssertNil(value.data?["value"])
    }
    func testConsentBoundsAndUnsupportedVersion() async throws {
        let c = try fixture(); let broker = PreviewBroker(registry: c.capabilities); let s = PreviewSession.sample(tenant: "vn-hn")
        let absent = await broker.call(session: s, capability: "net.request", operation: "get", args: [:]); XCTAssertEqual(absent.error, .notDeclared)
        let unknown = await broker.call(session: s, capability: "storage.kv", operation: "get", version: 2, args: ["key": "x"]); XCTAssertEqual(unknown.error, .unavailable)
        let large = await broker.call(session: s, capability: "storage.kv", operation: "set", args: ["key": "x", "value": String(repeating: "₫", count: 30000)]); XCTAssertEqual(large.error, .invalid)
        let consent = await broker.call(session: s, capability: "ai.extract_bill", operation: "extract", args: ["locale": "vi", "idempotencyKey": "test"]); XCTAssertEqual(consent.error, .consentRequired)
        let invalid = await broker.call(session: s, capability: "ai.extract_bill", operation: "extract", args: ["locale": "vi", "idempotencyKey": "test", "path": "/private/pixels"], consent: true); XCTAssertEqual(invalid.error, .invalid)
    }
}
