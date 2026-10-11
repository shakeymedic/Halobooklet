import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The app bundles the built website (../dist). Run `npm ci && npm run build` in the repo root first.
val siteDir = rootProject.file("../dist")
val siteVersion: Map<*, *> = rootProject.file("../dist/version.json").let {
    if (it.exists()) JsonSlurper().parse(it) as Map<*, *> else mapOf("version" to "dev", "major" to 0, "minor" to 0)
}
val appRevision = (findProperty("haloAppRevision") as String?)?.toInt() ?: 0
val bookletMajor = (siteVersion["major"] as Number).toInt()
val bookletMinor = (siteVersion["minor"] as Number).toInt()

android {
    namespace = "org.emevidence.haloqrh"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.emevidence.haloqrh"
        minSdk = 26
        targetSdk = 36
        // e.g. booklet 2.9, app revision 0 -> 20900; 2.10 -> 21000
        versionCode = maxOf(1, bookletMajor * 10000 + bookletMinor * 100 + appRevision)
        versionName = (siteVersion["version"] as String).removePrefix("Version ").substringBefore(" (") +
            if (appRevision > 0) ".$appRevision" else ""
    }

    signingConfigs {
        // Release signing comes from environment variables (set as GitHub Actions secrets), never from the repo.
        create("release") {
            val ks = System.getenv("HALO_KEYSTORE_FILE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("HALO_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HALO_KEY_ALIAS")
                keyPassword = System.getenv("HALO_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (System.getenv("HALO_KEYSTORE_FILE") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/siteAssets"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    // The PDF is already compressed; storing it uncompressed lets it be streamed straight from the APK.
    androidResources { noCompress += "pdf" }
}

val copySite by tasks.registering(Sync::class) {
    doFirst {
        check(siteDir.resolve("index.html").exists()) { "../dist is missing: run `npm ci && npm run build` in the repository root first." }
    }
    from(siteDir) { exclude("sw.js", "robots.txt", "sitemap.xml", "manifest.webmanifest") }
    into(layout.buildDirectory.dir("generated/siteAssets/site"))
}
tasks.named("preBuild") { dependsOn(copySite) }

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.14.0")
}
