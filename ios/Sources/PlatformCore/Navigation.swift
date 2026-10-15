import Foundation
public enum Routes {
    private static func segments(_ path: String) -> [String]? {
        guard path.hasPrefix("/"), path.utf8.count <= 512, !path.contains("://"), !path.contains("\\"), !path.hasPrefix("//") else { return nil }
        let pathname = path.components(separatedBy: CharacterSet(charactersIn: "?#"))[0]
        let parts = pathname.split(separator: "/").map(String.init)
        guard parts.allSatisfy({ part in guard let d = part.removingPercentEncoding else { return false }; return d != "." && d != ".." && !d.contains("/") && !d.contains("\\") }) else { return nil }; return parts
    }
    public static func allows(_ path: String, manifest: AppManifest) -> Bool { guard let candidate = segments(path) else { return false }; return manifest.routes.contains { pattern in guard let declared = segments(pattern), declared.count == candidate.count else { return false }; return zip(declared, candidate).allSatisfy { $0.hasPrefix(":") || $0 == $1 } } }
}
public struct Frame: Identifiable, Sendable {
    public let id: UUID; public let appId: String; public var history: [String]
    public var path: String { history.last ?? "/" }
    public init(appId: String, path: String = "/") { id = UUID(); self.appId = appId; history = [path] }
}
public struct Navigator: Sendable {
    public private(set) var frames: [Frame] = []
    public init() {}
    public mutating func open(_ id: String, catalog: Catalog, tenant: String) -> Bool {
        guard let app = catalog.app(id), catalog.tenant(tenant).featuredAppIds.contains(id) else { return false }
        if let index = frames.firstIndex(where: { $0.appId == id }) { frames = Array(frames.prefix(index + 1)) } else { frames.append(Frame(appId: id, path: app.rootRoute)) }; return true
    }
    public mutating func navigate(_ path: String, catalog: Catalog) -> Bool { guard let frame = frames.last, let app = catalog.app(frame.appId), Routes.allows(path, manifest: app), frame.history.count < 100 else { return false }; if frame.path != path { frames[frames.count - 1].history.append(path) }; return true }
    public mutating func back() { guard let frame = frames.last else { return }; if frame.history.count > 1 { frames[frames.count - 1].history.removeLast() } else { frames.removeLast() } }
    public mutating func close() { frames = [] }
    public mutating func cross(_ linkId: String, catalog: Catalog, tenant: String) -> Bool {
        guard let frame = frames.last, let source = catalog.app(frame.appId), let link = source.crossAppLinks.first(where: { $0.id == linkId }), let target = catalog.app(link.targetAppId), let entry = target.publicEntrypoints.first(where: { $0.name == link.targetEntrypoint }), entry.allowedSources.contains(source.id), Routes.allows(entry.path, manifest: target), open(target.id, catalog: catalog, tenant: tenant) else { return false }; frames[frames.count - 1] = Frame(appId: target.id, path: entry.path); return true
    }
    public mutating func notification(_ item: InboxItem, catalog: Catalog, tenant: String, now: Date = Date()) -> Bool {
        guard item.expiresAt.map({ $0 > now }) ?? true, let id = item.appId, let target = catalog.app(id), let entry = target.publicEntrypoints.first(where: { $0.name == item.entrypoint }), entry.allowedSources.contains("host_notification"), Set(item.input.keys).isSubset(of: Set(entry.allowedInputKeys)), (try? JSONEncoder().encode(item.input).count).map({ $0 <= 4096 }) ?? false, Routes.allows(entry.path, manifest: target), open(id, catalog: catalog, tenant: tenant) else { return false }; frames[frames.count - 1] = Frame(appId: id, path: entry.path); return true
    }
}
