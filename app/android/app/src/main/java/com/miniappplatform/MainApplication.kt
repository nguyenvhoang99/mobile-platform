package com.miniappplatform

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.miniappplatform.deviceaccess.DeviceAccessPackage
import com.miniappplatform.hoststorage.HostStoragePackage
import com.miniappplatform.notifications.NotificationPackage
import com.miniappplatform.ondevicellm.OnDeviceLlmPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
        context = applicationContext,
        packageList =
            PackageList(this).packages.apply {
              add(DeviceAccessPackage())
              add(HostStoragePackage())
              add(NotificationPackage())
              add(OnDeviceLlmPackage())
            },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
