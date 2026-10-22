import java.util.Properties

plugins {
    id("com.android.application")
}

val twa = Properties().apply { rootProject.file("twa.properties").inputStream().use { load(it) } }
val host: String = (findProperty("twaHost") as String?)?.takeIf { it.isNotBlank() } ?: twa.getProperty("host")
val startPath: String = twa.getProperty("startPath", "/")
require(Regex("^[a-z0-9.-]+$").matches(host)) { "twa host must be a bare host name, got '$host'" }

android {
    namespace = "in.autosutra.app"
    compileSdk = 35

    defaultConfig {
        applicationId = twa.getProperty("applicationId")
        minSdk = 23
        targetSdk = 35
        versionCode = (findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = "0.1.${versionCode}"
        manifestPlaceholders["hostName"] = host
        manifestPlaceholders["defaultUrl"] = "https://$host$startPath"
        resValue("string", "app_name", twa.getProperty("appName", "AutoSutra"))
        // Lets Chrome verify, with the site's /.well-known/assetlinks.json, that this app may open it full screen.
        resValue(
            "string",
            "asset_statements",
            "[{ \\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], \\\"target\\\": { \\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"https://$host\\\" } }]",
        )
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "release.keystore")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "autosutra"
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
