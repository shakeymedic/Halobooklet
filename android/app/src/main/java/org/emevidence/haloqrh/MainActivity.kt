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
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
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
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The whole handbook is bundled inside the app (assets/site, built from Index.html), so it works with
 * no signal. Pages are served from https://appassets.androidplatform.net/assets/site/ so they behave
 * exactly like the website.
 */
class MainActivity : ComponentActivity() {

    private lateinit var container: FrameLayout
    private lateinit var webView: WebView
    private val background = Executors.newSingleThreadExecutor()
    private val savingPdf = AtomicBoolean(false)
    private var lastRendererRestart = 0L

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

        container = FrameLayout(this)
        webView = createWebView()
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

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView = WebView(this).apply {
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

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        background.shutdown()
        container.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Android can kill the WebView's renderer (low memory, or a renderer crash). Without this the whole app
     * would be closed. The dead WebView cannot be reused, so it is replaced and the handbook is loaded again.
     */
    private fun recoverFromRendererLoss(dead: WebView) {
        if (dead !== webView || isFinishing || isDestroyed) return
        container.removeView(dead)
        dead.destroy()
        val now = android.os.SystemClock.elapsedRealtime()
        val restartedRecently = lastRendererRestart != 0L && now - lastRendererRestart < RENDERER_RESTART_WINDOW_MS
        lastRendererRestart = now
        webView = createWebView()
        container.addView(webView)
        if (restartedRecently) {
            // Two losses close together: do not reload in a loop. Close cleanly and say why.
            toast(R.string.renderer_failed)
            finish()
            return
        }
        webView.loadUrl(HOME)
    }

    private inner class Client : WebViewClient() {
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // Must not touch the dead WebView inside this callback's stack: do the swap on the next loop
            Handler(Looper.getMainLooper()).post { recoverFromRendererLoss(view) }
            return true
        }

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

    /**
     * Copies the bundled PDF into Downloads, then opens it in the phone's PDF viewer. The copy runs off the
     * main thread, repeated taps while it runs are ignored, and a copy already saved by this version is
     * replaced, not duplicated.
     */
    private fun savePdf() {
        if (!savingPdf.compareAndSet(false, true)) return
        background.execute {
            val saved: Uri? = try { writePdf() } catch (e: Exception) { null }
            runOnUiThread {
                savingPdf.set(false)
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (saved == null) { toast(R.string.pdf_failed); return@runOnUiThread }
                try {
                    startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(saved, PDF_MIME).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                    toast(R.string.pdf_saved)
                } catch (e: ActivityNotFoundException) {
                    toast(R.string.pdf_saved_no_viewer)
                }
            }
        }
    }

    private fun writePdf(): Uri {
        val fileName = "HALO-QRH-Adults-v${BuildConfig.VERSION_Adults}.pdf"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val downloads = MediaStore.Downloads.EXTERNAL_CONTENT_URI
            // Without a storage permission this query only sees files this app saved itself
            val existing: Uri? = contentResolver.query(
                downloads, arrayOf(MediaStore.Downloads._ID),
                "${MediaStore.Downloads.DISPLAY_Adults} = ?", arrayOf(fileName), null
            )?.use { c -> if (c.moveToFirst()) Uri.withAppendedPath(downloads, c.getLong(0).toString()) else null }
            if (existing != null) {
                try {
                    contentResolver.openOutputStream(existing, "wt")!!.use { out -> assets.open(PDF_ASSET).use { it.copyTo(out) } }
                    return existing
                } catch (e: Exception) {
                    // The file behind the entry has gone (deleted in a file manager): drop the entry and save afresh
                    try { contentResolver.delete(existing, null, null) } catch (ignored: Exception) { }
                }
            }
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_Adults, fileName)
                put(MediaStore.Downloads.MIME_TYPE, PDF_MIME)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(downloads, values)!!
            try {
                contentResolver.openOutputStream(uri)!!.use { out -> assets.open(PDF_ASSET).use { it.copyTo(out) } }
            } catch (e: Exception) {
                // Do not leave a half-written, pending entry behind
                try { contentResolver.delete(uri, null, null) } catch (ignored: Exception) { }
                throw e
            }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            contentResolver.update(uri, values, null, null)
            return uri
        }
        // Android 8-9: the app's own Downloads folder needs no permission and can be shared to a viewer.
        // The same file name is overwritten each time, so there are no duplicates here.
        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(cacheDir, "pdf").apply { mkdirs() }
        val file = File(dir, fileName)
        file.outputStream().use { out -> assets.open(PDF_ASSET).use { it.copyTo(out) } }
        return FileProvider.getUriForFile(this, "$packageName.files", file)
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    companion object {
        private const val HOME = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/site/index.html"
        private const val PDF_ASSET = "site/HALO-QRH-Adults.pdf"
        private const val PDF_MIME = "application/pdf"
        private const val RENDERER_RESTART_WINDOW_MS = 10_000L
    }
}
