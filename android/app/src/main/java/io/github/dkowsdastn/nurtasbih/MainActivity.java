package io.github.dkowsdastn.nurtasbih;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/** Offline app shell. Only HTTPS external sources open outside the app. */
public final class MainActivity extends ComponentActivity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/site/index.html";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 248, 243));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247, 248, 243));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(true);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        web.setSaveEnabled(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
                        && uri.getPath() != null && uri.getPath().startsWith("/assets/site/")) return false;
                if (request.isForMainFrame() && "https".equals(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');"
                    + "if(d){d.close();return true;}var x=document.querySelector('#exitFocus:not([hidden])');"
                    + "if(x){x.click();return true;}var b=document.querySelector('.nav-item[data-target=tasbih]');"
                    + "if(b&&!b.classList.contains('active')){b.click();return true;}return false;})()", result -> {
                        if (!"true".equals(result)) {
                            if (web.canGoBack()) web.goBack(); else finish();
                        }
                    });
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        web.saveState(out);
        super.onSaveInstanceState(out);
    }
    @Override protected void onPause() {
        web.evaluateJavascript("document.querySelectorAll('audio').forEach(function(a){a.pause();})", null);
        web.onPause(); super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if(web!=null)web.onResume(); }
    @Override protected void onDestroy() {
        if(web!=null) { web.stopLoading(); ((FrameLayout)web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
