//! Keeps the main window reachable. A window position restored by the window-state plugin can
//! lie outside every connected monitor (external display unplugged, resolution change), which
//! makes the window "disappear" as soon as the user touches it.

/// Rectangle in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// Minimum visible part of the window (in each direction) that counts as "on screen".
const MIN_VISIBLE: i64 = 120;

fn overlap(a: Rect, b: Rect) -> (i64, i64) {
    let ox = (a.x as i64 + a.w as i64).min(b.x as i64 + b.w as i64) - (a.x as i64).max(b.x as i64);
    let oy = (a.y as i64 + a.h as i64).min(b.y as i64 + b.h as i64) - (a.y as i64).max(b.y as i64);
    (ox, oy)
}

/// Returns the position the window should be moved to, or `None` when it is already usable.
/// `monitors` are the work areas of all connected monitors, the first one is the fallback.
pub fn fix_position(window: Rect, monitors: &[Rect]) -> Option<(i32, i32)> {
    let fallback = *monitors.first()?;
    let visible = monitors.iter().any(|m| {
        let (ox, oy) = overlap(window, *m);
        ox >= MIN_VISIBLE.min(window.w as i64) && oy >= MIN_VISIBLE.min(window.h as i64)
    });
    if visible {
        return None;
    }
    // Center on the fallback monitor; a window larger than the monitor is pinned to its corner.
    let x = fallback.x as i64 + ((fallback.w as i64 - window.w as i64) / 2).max(0);
    let y = fallback.y as i64 + ((fallback.h as i64 - window.h as i64) / 2).max(0);
    Some((x as i32, y as i32))
}

/// Smallest usable window in logical pixels. The window collapsed to a few pixels while it was
/// dragged (a saved state of 5x5 was found on a real machine), which makes it invisible; only the
/// macOS menu Window > Zoom brought it back. Enforced as min size, on resize events and on restore.
pub const MIN_LOGICAL_W: f64 = 480.0;
pub const MIN_LOGICAL_H: f64 = 360.0;

/// Window size used when a collapsed window is rebuilt (logical pixels).
pub const DEFAULT_LOGICAL_W: f64 = 1200.0;
pub const DEFAULT_LOGICAL_H: f64 = 800.0;

/// True when the window is too small to be usable (collapsed), given the physical minimum.
pub fn is_collapsed(size: (u32, u32), min: (u32, u32)) -> bool {
    size.0 < min.0 || size.1 < min.1
}

/// Rebuilds a collapsed window: a usable default size (capped to the fallback monitor, never below
/// `min`), centered on the first monitor. Returns the new rectangle, or `None` when the window is fine.
pub fn repair_collapsed(
    window: Rect,
    min: (u32, u32),
    default: (u32, u32),
    monitors: &[Rect],
) -> Option<Rect> {
    if !is_collapsed((window.w, window.h), min) {
        return None;
    }
    let fallback = *monitors.first()?;
    let w = default.0.min(fallback.w).max(min.0);
    let h = default.1.min(fallback.h).max(min.1);
    let x = fallback.x as i64 + ((fallback.w as i64 - w as i64) / 2).max(0);
    let y = fallback.y as i64 + ((fallback.h as i64 - h as i64) / 2).max(0);
    Some(Rect { x: x as i32, y: y as i32, w, h })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };
    const SIDE: Rect = Rect { x: 1920, y: 0, w: 1920, h: 1080 };

    #[test]
    fn keeps_window_inside_monitor() {
        let w = Rect { x: 100, y: 100, w: 1000, h: 700 };
        assert_eq!(fix_position(w, &[MAIN]), None);
    }

    #[test]
    fn keeps_window_on_second_monitor() {
        let w = Rect { x: 2200, y: 50, w: 1000, h: 700 };
        assert_eq!(fix_position(w, &[MAIN, SIDE]), None);
    }

    #[test]
    fn recovers_window_of_unplugged_monitor() {
        let w = Rect { x: 2200, y: 50, w: 1000, h: 700 };
        assert_eq!(fix_position(w, &[MAIN]), Some((460, 190)));
    }

    #[test]
    fn recovers_window_with_only_a_sliver_visible() {
        let w = Rect { x: 1900, y: 100, w: 1000, h: 700 };
        assert_eq!(fix_position(w, &[MAIN]), Some((460, 190)));
    }

    #[test]
    fn recovers_window_far_above_the_screen() {
        let w = Rect { x: 100, y: -5000, w: 1000, h: 700 };
        assert_eq!(fix_position(w, &[MAIN]), Some((460, 190)));
    }

    #[test]
    fn window_larger_than_monitor_goes_to_corner() {
        let w = Rect { x: 5000, y: 5000, w: 3000, h: 2000 };
        assert_eq!(fix_position(w, &[MAIN]), Some((0, 0)));
    }

    #[test]
    fn no_monitors_means_no_change() {
        let w = Rect { x: 5000, y: 5000, w: 1000, h: 700 };
        assert_eq!(fix_position(w, &[]), None);
    }

    #[test]
    fn detects_collapsed_window() {
        assert!(is_collapsed((5, 5), (480, 360)));
        assert!(is_collapsed((1000, 0), (480, 360)));
        assert!(!is_collapsed((480, 360), (480, 360)));
    }

    #[test]
    fn rebuilds_the_5x5_window_from_the_real_report() {
        // Saved state found on the affected Mac: 5x5 at -2940,1466 (a display that is gone).
        let w = Rect { x: -2940, y: 1466, w: 5, h: 5 };
        let fixed = repair_collapsed(w, (480, 360), (1200, 800), &[MAIN]).unwrap();
        assert_eq!(fixed, Rect { x: 360, y: 140, w: 1200, h: 800 });
    }

    #[test]
    fn rebuilt_window_never_exceeds_a_small_monitor() {
        let small = Rect { x: 0, y: 0, w: 1000, h: 600 };
        let fixed = repair_collapsed(Rect { x: 0, y: 0, w: 0, h: 0 }, (480, 360), (1200, 800), &[small]).unwrap();
        assert_eq!((fixed.w, fixed.h), (1000, 600));
    }

    #[test]
    fn healthy_window_is_not_rebuilt() {
        let w = Rect { x: 10, y: 10, w: 900, h: 700 };
        assert_eq!(repair_collapsed(w, (480, 360), (1200, 800), &[MAIN]), None);
    }
}
