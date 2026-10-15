import UIKit
import UserNotifications
@MainActor final class RemoteAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) { NotificationService.shared.registration = "APNs đã cấp token trên máy. Chưa đăng ký với backend; token không được log hoặc đưa cho mini-app." }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { NotificationService.shared.registration = "Chưa đăng ký được APNs. Cần entitlement/provisioning hợp lệ; dữ liệu trên máy vẫn dùng được." }
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) { NotificationService.shared.receiveRemote(userInfo, opened: false); completionHandler(.noData) }
}
