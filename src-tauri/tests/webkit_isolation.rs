//! Issue #7: saved connections really live in separate, persistent WebKit data stores.
//!
//! WebKit only works on the main thread, so this test has its own `main` (harness = false). It
//! creates two real stores, so it only runs when asked for:
//!
//!     DIDDY_WEBKIT_TEST=1 cargo test --test webkit_isolation
//!
//! It writes a cookie into store A and checks that store B and the default store (the original
//! login) never see it, that reopening A finds it again, and removes both stores afterwards.

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("webkit_isolation: macOS only, skipped");
}

#[cfg(target_os = "macos")]
fn main() {
    if std::env::var_os("DIDDY_WEBKIT_TEST").is_none() {
        println!("webkit_isolation: skipped, set DIDDY_WEBKIT_TEST=1 to create real WebKit stores");
        return;
    }
    macos::run();
    println!("webkit_isolation: ok");
}

#[cfg(target_os = "macos")]
mod macos {
    use std::{cell::RefCell, ptr::NonNull, rc::Rc, time::Instant};

    use app_lib::isolated_data_store;
    use block2::RcBlock;
    use objc2::{rc::Retained, runtime::AnyObject, MainThreadMarker};
    use objc2_foundation::{
        NSArray, NSDate, NSDictionary, NSError, NSHTTPCookie, NSHTTPCookieDomain, NSHTTPCookieName,
        NSHTTPCookiePath, NSHTTPCookieValue, NSRunLoop, NSString, NSUUID,
    };
    use objc2_web_kit::WKWebsiteDataStore;

    /// Runs the main run loop until `done` or 10 s pass; WebKit answers through it.
    fn spin(done: impl Fn() -> bool, what: &str) {
        let started = Instant::now();
        while !done() {
            assert!(started.elapsed().as_secs() < 10, "WebKit did not answer: {what}");
            NSRunLoop::currentRunLoop().runUntilDate(&NSDate::dateWithTimeIntervalSinceNow(0.05));
        }
    }

    fn cookie(name: &str, value: &str) -> Retained<NSHTTPCookie> {
        let name = NSString::from_str(name);
        let value = NSString::from_str(value);
        let domain = NSString::from_str("isolation.diddy.test");
        let path = NSString::from_str("/");
        unsafe {
            let keys = [NSHTTPCookieName, NSHTTPCookieValue, NSHTTPCookieDomain, NSHTTPCookiePath];
            let objects: [&AnyObject; 4] = [&name, &value, &domain, &path];
            let properties = NSDictionary::from_slices(&keys, &objects);
            NSHTTPCookie::cookieWithProperties(&properties).expect("valid test cookie")
        }
    }

    fn set_cookie(store: &WKWebsiteDataStore, cookie: &NSHTTPCookie) {
        let done = Rc::new(RefCell::new(false));
        let flag = Rc::clone(&done);
        let block = RcBlock::new(move || *flag.borrow_mut() = true);
        unsafe { store.httpCookieStore().setCookie_completionHandler(cookie, Some(&block)) };
        spin(|| *done.borrow(), "setCookie");
    }

    /// Values of the cookies named `name` in a store.
    fn cookie_values(store: &WKWebsiteDataStore, name: &str) -> Vec<String> {
        let result: Rc<RefCell<Option<Vec<String>>>> = Rc::new(RefCell::new(None));
        let sink = Rc::clone(&result);
        let wanted = name.to_string();
        let block = RcBlock::new(move |cookies: NonNull<NSArray<NSHTTPCookie>>| {
            let cookies = unsafe { cookies.as_ref() };
            let values = cookies
                .iter()
                .filter(|c| c.name().to_string() == wanted)
                .map(|c| c.value().to_string())
                .collect();
            *sink.borrow_mut() = Some(values);
        });
        unsafe { store.httpCookieStore().getAllCookies(&block) };
        spin(|| result.borrow().is_some(), "getAllCookies");
        let values = result.borrow_mut().take().unwrap();
        values
    }

    fn remove_store(id: [u8; 16], mtm: MainThreadMarker) {
        let done = Rc::new(RefCell::new(false));
        let flag = Rc::clone(&done);
        let block = RcBlock::new(move |_error: *mut NSError| *flag.borrow_mut() = true);
        unsafe {
            WKWebsiteDataStore::removeDataStoreForIdentifier_completionHandler(&NSUUID::from_bytes(id), &block, mtm)
        };
        spin(|| *done.borrow(), "removeDataStoreForIdentifier");
    }

    pub fn run() {
        let mtm = MainThreadMarker::new().expect("main thread");
        let id_a = NSUUID::new().as_bytes();
        let id_b = NSUUID::new().as_bytes();
        let marker = NSUUID::new().UUIDString().to_string();
        let name = "diddy_isolation";
        {
            let a = isolated_data_store(id_a, mtm).expect("store A");
            let b = isolated_data_store(id_b, mtm).expect("store B");
            let default_store = unsafe { WKWebsiteDataStore::defaultDataStore(mtm) };
            assert!(!std::ptr::eq(&*a, &*b), "two connections, two stores");
            assert!(!std::ptr::eq(&*a, &*default_store) && !std::ptr::eq(&*b, &*default_store));
            assert!(unsafe { a.isPersistent() && b.isPersistent() }, "logins must survive a restart");

            let default_before = cookie_values(&default_store, name);
            set_cookie(&a, &cookie(name, &marker));
            assert_eq!(cookie_values(&a, name), [marker.clone()], "A keeps its own data");
            assert!(cookie_values(&b, name).is_empty(), "B never sees A's data");
            assert_eq!(cookie_values(&default_store, name), default_before, "the original login is untouched");

            // opening the same connection again finds the same store and its data
            let again = isolated_data_store(id_a, mtm).expect("store A again");
            assert_eq!(cookie_values(&again, name), [marker.clone()]);
        }
        remove_store(id_a, mtm);
        remove_store(id_b, mtm);
    }
}
