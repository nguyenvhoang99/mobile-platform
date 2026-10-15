// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "PlatformCore", platforms: [.macOS(.v13), .iOS("15.1")], products: [.library(name: "PlatformCore", targets: ["PlatformCore"])], targets: [.target(name: "PlatformCore"), .testTarget(name: "PlatformCoreTests", dependencies: ["PlatformCore"])])
