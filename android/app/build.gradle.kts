plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val enableFirebase = providers.gradleProperty("enableFirebase").orNull == "true"
android {
    namespace = "com.miniappplatform.nativehost"
    compileSdk = 36
    defaultConfig { applicationId = "com.miniappplatform.nativehost"; minSdk = 24; targetSdk = 36; versionCode = 1; versionName = "1.0"; testInstrumentationRunner = providers.gradleProperty("testRunner").orNull ?: "com.miniappplatform.nativehost.SmokeInstrumentation" }
    sourceSets["main"].assets.srcDir("../../native/shared")
    sourceSets["main"].java.srcDir(if (enableFirebase) "src/fcm/java" else "src/noPush/java")
    if (enableFirebase) { sourceSets["debug"].manifest.srcFile("src/fcmDebug/AndroidManifest.xml"); sourceSets["release"].manifest.srcFile("src/fcm/AndroidManifest.xml") }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildTypes { release { isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") } }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies { implementation("com.google.ai.edge.litertlm:litertlm-android:0.17.1"); implementation("com.google.zxing:core:3.5.4"); debugImplementation("com.google.mlkit:text-recognition:16.0.1"); debugImplementation("com.google.ai.edge.litert:litert:1.4.2"); if (enableFirebase) implementation("com.google.firebase:firebase-messaging:25.1.1"); testImplementation("junit:junit:4.13.2") }
