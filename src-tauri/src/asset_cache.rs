//! Caching of the app's own files served by the localhost plugin. The plugin sends every file
//! with `Cache-Control: no-cache`, so each start read the ~10 MB of scripts and crypto code again.
//! Build output whose name carries a content hash (`/assets/index-BsyCF7gU.js`, Element Call's
//! `/public/element-call/assets/…`) never changes under that name and may stay cached; the page
//! shell, the service worker and the config keep `no-cache` and follow an update at once.
//! Same rule as `electron/lib/staticServer.cjs`.

pub const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// The `Cache-Control` value for a request URL, or None to keep the plugin's `no-cache`.
pub fn cache_control(url: &str) -> Option<&'static str> {
    let path = url.split(['?', '#']).next().unwrap_or("");
    let name = path
        .strip_prefix("/public/element-call/assets/")
        .or_else(|| path.strip_prefix("/assets/"))?;
    if name.contains('/') {
        return None;
    }
    let (stem, ext) = name.rsplit_once('.')?;
    if ext.is_empty() || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    // "-" and then exactly eight hash characters before the extension (Vite's default)
    let chars: Vec<char> = stem.chars().collect();
    if chars.len() < 10 || chars[chars.len() - 9] != '-' {
        return None;
    }
    let hash = &chars[chars.len() - 8..];
    if hash.iter().all(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-') {
        Some(IMMUTABLE)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashed_build_files_are_immutable() {
        assert_eq!(cache_control("/assets/index-BsyCF7gU.js"), Some(IMMUTABLE));
        assert_eq!(cache_control("/assets/matrix_sdk_crypto_wasm_bg-DwIieW7K.wasm"), Some(IMMUTABLE));
        assert_eq!(cache_control("/public/element-call/assets/index-Dul-9Slf.js?v=1"), Some(IMMUTABLE));
    }

    #[test]
    fn everything_else_keeps_no_cache() {
        assert_eq!(cache_control("/"), None);
        assert_eq!(cache_control("/index.html"), None);
        assert_eq!(cache_control("/sw.js"), None);
        assert_eq!(cache_control("/config.json"), None);
        assert_eq!(cache_control("/public/element-call/index.html"), None);
        assert_eq!(cache_control("/assets/unhashed.js"), None);
        assert_eq!(cache_control("/assets/sub/dir-BsyCF7gU.js"), None);
        assert_eq!(cache_control("/other/index-BsyCF7gU.js"), None);
    }
}
