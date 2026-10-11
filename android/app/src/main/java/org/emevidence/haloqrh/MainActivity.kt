package org.emevidence.haloqrh

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * The whole handbook is bundled inside the app (assets/site, built from Index.html), so it works with
 * no signal. Pages are served from https://appassets.androidplatform.net/assets/site/ so they behave
 * exactly like the website.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    private val assetLoader by lazy {
        val assets = WebViewAssetLoader.AssetsPathHandler(this)
        WebViewAssetLoader.Builder()
            // Folder links such as "./" should open that folder's index.html, as they do on the website
            .addPathHandler("/assets/") { path ->
                assets.handle(if (path.isEmpty() || path.endsWith("/")) path + "index.html" else path)
            }
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A cognitive aid used mid-procedure should not lock itself
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val container = FrameLayout(this)
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(0xFFF3F5F8.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.userAgentString = "${settings.userAgentString} HaloQrhApp/${BuildConfig.VERSION_NAME}"
            webViewClient = Client()
            setDownloadListener { url, _, _, _, _ -> if (isPdf(Uri.parse(url))) savePdf() }
        }
        container.addView(webView)
        setContentView(container)

        // Keep content clear of the status bar, navigation bar and camera cut-out (edge-to-edge is enforced on Android 15+)
        ViewCompat.setOnApplyWindowInsetsListener(container) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState) else webView.loadUrl(HOME)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            assetLoader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == WebViewAssetLoader.DEFAULT_DOMAIN) {
                if (isPdf(url)) { savePdf(); return true }
                return false
            }
            // Guideline links, email and anything else open in the phone's own apps
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
            } catch (e: ActivityNotFoundException) {
                toast(R.string.no_app_for_link)
            }
            return true
        }
    }

    private fun isPdf(url: Uri) = url.lastPathSegment?.endsWith(".pdf", ignoreCase = true) == true

    /** Copies the bundled PDF into Downloads, then opens it in the phone's PDF viewer. */
    private fun savePdf() {
        val fileName = "HALO-QRH-Adults-v${BuildConfig.VERSION_NAME}.pdf"
        val saved: Uri = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, PDF_MIME)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)!!
                contentResolver.openOutputStream(uri)!!.use { out -> assets.open(PDF_ASSET).use { it.copyTo(out) } }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
                uri
            } else {
                // Android 8-9: the app's own Downloads folder needs no permission and can be shared to a viewer
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(cacheDir, "pdf").apply { mkdirs() }
                val file = File(dir, fileName)
                file.outputStream().use { out -> assets.open(PDF_ASSET).use { it.copyTo(out) } }
                FileProvider.getUriForFile(this, "$packageName.files", file)
            }
        } catch (e: Exception) {
            toast(R.string.pdf_failed)
            return
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(saved, PDF_MIME).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            toast(R.string.pdf_saved)
        } catch (e: ActivityNotFoundException) {
            toast(R.string.pdf_saved_no_viewer)
        }
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    companion object {
        private const val HOME = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/site/index.html"
        private const val PDF_ASSET = "site/HALO-QRH-Adults.pdf"
        private const val PDF_MIME = "application/pdf"
    }
}
